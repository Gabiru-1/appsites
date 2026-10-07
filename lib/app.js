'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const PB = require('../public/js/blocks.js');
const { renderPage } = require('../public/js/render.js');
const pages = require('./pages.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function html(res, status, body) {
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Conteúdo muito grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (e) {
    return false;
  }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

function checkAuth(req, password) {
  if (!password) return true;
  const header = req.headers.authorization || '';
  const m = header.match(/^Basic (.+)$/);
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(a, b);
}

function pageSummary(store, p) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    published: p.published,
    blockCount: p.blocks.length,
    submissionCount: store.countSubmissions(p.id),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function notFoundPage() {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Página não encontrada</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#374151}' +
    'div{text-align:center}h1{font-size:4rem;margin:0;color:#4f46e5}</style></head>' +
    '<body><div><h1>404</h1><p>Esta página não existe ou ainda não foi publicada.</p></div></body></html>';
}

function createApp(store, options) {
  options = options || {};
  const password = options.adminPassword || '';

  async function handleApi(req, res, parts, query) {
    const method = req.method;

    // /api/meta — blocos e modelos disponíveis
    if (parts.length === 1 && parts[0] === 'meta' && method === 'GET') {
      const templates = Object.keys(PB.TEMPLATES).map((k) => ({
        id: k, label: PB.TEMPLATES[k].label, description: PB.TEMPLATES[k].description,
      }));
      return json(res, 200, { templates });
    }

    if (parts[0] !== 'pages') return json(res, 404, { error: 'Rota não encontrada' });

    // /api/pages
    if (parts.length === 1) {
      if (method === 'GET') return json(res, 200, store.listPages().map((p) => pageSummary(store, p)));
      if (method === 'POST') {
        const page = pages.createPage(store, await readJson(req));
        return json(res, 201, page);
      }
      return json(res, 405, { error: 'Método não permitido' });
    }

    const id = parts[1];
    const page = store.getPage(id);
    if (!page) return json(res, 404, { error: 'Página não encontrada' });

    // /api/pages/:id
    if (parts.length === 2) {
      if (method === 'GET') return json(res, 200, page);
      if (method === 'PUT' || method === 'PATCH') {
        return json(res, 200, pages.updatePage(store, id, await readJson(req)));
      }
      if (method === 'DELETE') {
        store.deletePage(id);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'Método não permitido' });
    }

    const action = parts[2];
    if (action === 'duplicate' && method === 'POST' && parts.length === 3) {
      return json(res, 201, pages.duplicatePage(store, id));
    }
    if (action === 'export' && method === 'GET' && parts.length === 3) {
      const filename = (page.slug || 'pagina') + '.html';
      return send(res, 200, renderPage(page, {}), {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      });
    }
    if (action === 'submissions') {
      if (parts.length === 3 && method === 'GET') return json(res, 200, store.listSubmissions(id));
      if (parts.length === 4 && method === 'DELETE') {
        return store.deleteSubmission(id, parts[3])
          ? json(res, 200, { ok: true })
          : json(res, 404, { error: 'Mensagem não encontrada' });
      }
    }
    return json(res, 404, { error: 'Rota não encontrada' });
  }

  async function handlePublic(req, res, slug, rest, query) {
    const page = store.getPageBySlug(slug);
    if (!page || !page.published) return html(res, 404, notFoundPage());

    if (rest === '' && req.method === 'GET') {
      const out = renderPage(page, { sent: query.get('enviado') === '1', formAction: '/p/' + page.slug + '/contato' });
      return html(res, 200, out);
    }

    if (rest === 'contato' && req.method === 'POST') {
      const hasForm = page.blocks.some((b) => b.type === 'contact');
      if (!hasForm) return html(res, 404, notFoundPage());
      const form = new URLSearchParams(await readBody(req));
      // Campo "website" é armadilha para robôs (honeypot)
      if (!form.get('website')) {
        const name = String(form.get('name') || '').trim().slice(0, 120);
        const email = String(form.get('email') || '').trim().slice(0, 200);
        const message = String(form.get('message') || '').trim().slice(0, 5000);
        if (!name || !email || !message) return html(res, 400, 'Preencha todos os campos.');
        store.addSubmission({
          id: crypto.randomUUID(),
          pageId: page.id,
          name, email, message,
          createdAt: new Date().toISOString(),
        });
      }
      res.writeHead(303, { Location: '/p/' + page.slug + '?enviado=1#contato' });
      return res.end();
    }
    return html(res, 404, notFoundPage());
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      // Páginas publicadas são públicas
      const pub = pathname.match(/^\/p\/([a-z0-9-]+)\/?(.*)$/);
      if (pub) return await handlePublic(req, res, pub[1], pub[2], url.searchParams);

      if (!checkAuth(req, password)) {
        return send(res, 401, 'Autenticação necessária', { 'WWW-Authenticate': 'Basic realm="AppSites", charset="UTF-8"' });
      }

      if (pathname.startsWith('/api/')) {
        const parts = pathname.slice(5).split('/').filter(Boolean);
        return await handleApi(req, res, parts, url.searchParams);
      }

      if (req.method === 'GET' && serveStatic(res, pathname)) return;
      return html(res, 404, notFoundPage());
    } catch (err) {
      if (err instanceof pages.ValidationError) return json(res, 400, { error: err.message });
      if (err.status) return json(res, err.status, { error: err.message });
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'Erro interno' });
    }
  });
}

module.exports = { createApp };
