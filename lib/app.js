'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const PB = require('../public/js/blocks.js');
const pages = require('./pages.js');
const auth = require('./auth.js');
const google = require('./google.js');
const leads = require('./leads.js');
const sitedata = require('./sitedata.js');
const templates = require('./templates.js');
const publish = require('./publish.js');
const ai = require('./ai.js');
const { createZip } = require('./zip.js');
const { AsyncLocalStorage } = require('async_hooks');
const { createDiskMedia } = require('./media.js');
const { createSecrets, mask } = require('./secrets.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 4 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const DEFAULT_OUTREACH =
  'Olá, tudo bem? Encontrei a {nome} no Google Maps{nota} e preparei uma prévia de site para vocês, sem compromisso: {link}\n\n' +
  'Um site profissional ajuda a aparecer no Google e receber mais clientes pelo WhatsApp. Posso te mostrar como funciona?';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- utilitários HTTP ----------

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
        reject(new HttpError(413, 'Conteúdo muito grande'));
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
    throw new HttpError(400, 'JSON inválido');
  }
}

function serveFile(res, file, cache) {
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cache || 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(res, urlPath) {
  const routes = { '/': '/app.html', '/login': '/login.html', '/editor': '/editor.html', '/site': '/site.html' };
  const rel = routes[urlPath] || urlPath;
  let file;
  try {
    file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel)));
  } catch (e) {
    return false;
  }
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (e) {
    return false;
  }
  if (!stat.isFile()) return false;
  serveFile(res, file);
  return true;
}

function notFoundPage() {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Página não encontrada</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#374151}' +
    'div{text-align:center}h1{font-size:4rem;margin:0;color:#4f46e5}</style></head>' +
    '<body><div><h1>404</h1><p>Esta página não existe ou ainda não foi publicada.</p></div></body></html>';
}

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
}

function isSecure(req) {
  return String(req.headers['x-forwarded-proto'] || '').startsWith('https') || String(process.env.PUBLIC_URL || '').startsWith('https');
}

// ---------- aplicação ----------

function setupPage(problems) {
  const items = problems.map((p) => '<li>' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>').join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Configuração pendente — AppSites</title><style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#111827;margin:0;padding:24px}' +
    'main{max-width:680px;margin:40px auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,.08)}' +
    'h1{margin-top:0;font-size:22px}li{margin:8px 0}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}ol{padding-left:20px}</style></head><body><main>' +
    '<h1>⚙️ Falta configurar o projeto na Vercel</h1><p>O sistema está no ar, mas precisa destes itens:</p><ul>' + items + '</ul>' +
    '<h2 style="font-size:16px">Como resolver (opção Supabase)</h2><ol>' +
    '<li>No Supabase, crie um projeto. Na Vercel, abra o projeto → <b>Storage</b> (ou <b>Integrations</b>) → <b>Supabase</b> → conecte ao projeto existente. ' +
    'Isso cria <code>POSTGRES_URL</code>, <code>SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code>.</li>' +
    '<li>Sem a integração: em <b>Settings → Environment Variables</b>, crie <code>DATABASE_URL</code> (Supabase → Connect → <i>Transaction pooler</i>, porta 6543), ' +
    '<code>SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Project Settings → API).</li>' +
    '<li>Alternativa sem Supabase: <b>Storage → Neon</b> (banco) + <b>Storage → Blob</b> (fotos).</li>' +
    '<li>Em <b>Settings → Environment Variables</b>, crie <code>APP_SECRET</code> com uma senha longa e aleatória (guarde-a; ela protege as chaves de API).</li>' +
    '<li>Vá em <b>Deployments</b> e clique em <b>Redeploy</b> no último deploy.</li></ol></main></body></html>';
}

/**
 * Cria o "handler" HTTP (req, res). Funciona como função da Vercel e dentro de http.createServer.
 * options.openStore(): devolve o armazenamento a usar em cada requisição.
 */
function createHandler(options) {
  options = options || {};
  const problems = (options.configErrors || []).slice();
  const media = options.media || createDiskMedia(options.dataDir);
  let secrets = null;
  try {
    secrets = createSecrets(options.dataDir);
  } catch (e) {
    problems.push(e.message);
  }
  const openStore = options.openStore;

  // "store" aponta para o armazenamento da requisição atual
  const als = new AsyncLocalStorage();
  const store = new Proxy({}, {
    get(_, key) {
      const s = als.getStore();
      if (!s) throw new Error('Armazenamento indisponível fora de uma requisição');
      const v = s[key];
      return typeof v === 'function' ? v.bind(s) : v;
    },
  });
  const allowSignup = options.allowSignup !== false;

  const userKey = (user, name) => secrets.decrypt((user.settings || {})[name]);
  const loginFailures = new Map();

  function ownPage(user, id) {
    const p = store.get('pages', id);
    if (!p || p.userId !== user.id) throw new HttpError(404, 'Página não encontrada');
    return p;
  }

  function ownLead(user, id) {
    const l = store.get('leads', id);
    if (!l || l.userId !== user.id) throw new HttpError(404, 'Lead não encontrado');
    return l;
  }

  function pageSummary(p) {
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      kind: p.kind || 'blocks',
      published: p.published,
      leadId: p.leadId || null,
      templateId: p.templateId || null,
      blockCount: (p.blocks || []).length,
      submissionCount: store.count('submissions', (s) => s.pageId === p.id),
      vercel: p.vercel || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  function absolutize(req, data) {
    const base = baseUrl(req);
    return Object.assign({}, data, { fotos: (data.fotos || []).map((f) => (f.startsWith('/') ? base + f : f)) });
  }

  function settingsView(user) {
    const s = user.settings || {};
    return {
      googleApiKey: mask(userKey(user, 'googleApiKey')),
      anthropicApiKey: mask(userKey(user, 'anthropicApiKey')),
      vercelToken: mask(userKey(user, 'vercelToken')),
      hasGoogle: Boolean(userKey(user, 'googleApiKey')),
      hasAnthropic: Boolean(userKey(user, 'anthropicApiKey') || process.env.ANTHROPIC_API_KEY),
      hasVercel: Boolean(userKey(user, 'vercelToken')),
      vercelTeamId: s.vercelTeamId || '',
      outreachMessage: s.outreachMessage || DEFAULT_OUTREACH,
      companyName: s.companyName || '',
    };
  }

  // ---------- rotas ----------
  // Cada rota: [método, padrão, handler(ctx), opções]
  const routes = [];
  const route = (method, pattern, handler, opts) => routes.push({ method, pattern, handler, opts: opts || {} });
  const PUBLIC = { public: true };
  const ADMIN = { admin: true };

  // Autenticação
  route('GET', /^\/api\/auth\/me$/, ({ user }) => ({ user: auth.publicUser(user), settings: settingsView(user) }));
  route('GET', /^\/api\/auth\/config$/, () => ({ allowSignup, hasUsers: store.all('users').length > 0 }), PUBLIC);
  route('POST', /^\/api\/auth\/register$/, async ({ req, res, body }) => {
    if (!allowSignup && store.all('users').length > 0) throw new HttpError(403, 'Cadastro desativado. Peça acesso ao administrador.');
    const user = auth.register(store, body);
    const token = auth.createSession(store, user.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, isSecure(req)));
    return { user: auth.publicUser(user) };
  }, PUBLIC);
  route('POST', /^\/api\/auth\/login$/, async ({ req, res, body }) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const recent = (loginFailures.get(ip) || []).filter((t) => now - t < 15 * 60000);
    if (recent.length >= 10) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
    let user;
    try {
      user = auth.login(store, body.email, body.password);
    } catch (e) {
      recent.push(now);
      loginFailures.set(ip, recent);
      throw e;
    }
    loginFailures.delete(ip);
    const token = auth.createSession(store, user.id);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, isSecure(req)));
    return { user: auth.publicUser(user) };
  }, PUBLIC);
  route('POST', /^\/api\/auth\/logout$/, ({ req, res }) => {
    auth.destroySession(store, req);
    res.setHeader('Set-Cookie', auth.clearCookie());
    return { ok: true };
  }, PUBLIC);
  route('POST', /^\/api\/account\/password$/, ({ user, body }) => {
    auth.changePassword(store, user, body.current, body.next);
    return { ok: true };
  });

  // Configurações (chaves de API)
  route('GET', /^\/api\/settings$/, ({ user }) => settingsView(user));
  route('PUT', /^\/api\/settings$/, ({ user, body }) => {
    user.settings = user.settings || {};
    for (const key of ['googleApiKey', 'anthropicApiKey', 'vercelToken']) {
      if (typeof body[key] === 'string' && !body[key].startsWith('••')) {
        user.settings[key] = secrets.encrypt(body[key].trim().slice(0, 500));
      }
    }
    if (typeof body.vercelTeamId === 'string') user.settings.vercelTeamId = body.vercelTeamId.trim().slice(0, 100);
    if (typeof body.outreachMessage === 'string') user.settings.outreachMessage = body.outreachMessage.slice(0, 2000);
    if (typeof body.companyName === 'string') user.settings.companyName = body.companyName.trim().slice(0, 100);
    if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim().slice(0, 80);
    store.update('users', user.id, user);
    return settingsView(user);
  });

  // Painel de vendas
  route('GET', /^\/api\/dashboard$/, ({ user }) => leads.dashboard(store, user.id));

  // Prospecção
  route('POST', /^\/api\/prospect\/search$/, async ({ user, body }) => {
    const result = await google.search(userKey(user, 'googleApiKey'), body);
    const saved = new Map(store.filter('leads', (l) => l.userId === user.id).map((l) => [l.placeId, l.id]));
    result.results = result.results.map((p) => Object.assign({ leadId: saved.get(p.placeId) || null }, p, { fotosGoogle: undefined, fotos: (p.fotosGoogle || []).length, fotoCapa: ((p.fotosGoogle || [])[0] || {}).name || '' }));
    return result;
  });
  route('GET', /^\/api\/prospect\/photo$/, async ({ user, res, query }) => {
    // Miniatura de foto do Google sem salvar (usada nos cartões da busca)
    const { buffer, contentType } = await google.photo(userKey(user, 'googleApiKey'), query.get('name'), 400);
    send(res, 200, buffer, { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=86400' });
  });

  // Leads (CRM)
  route('GET', /^\/api\/leads$/, ({ user, query }) => {
    const status = query.get('status');
    return store.filter('leads', (l) => l.userId === user.id && (!status || l.status === status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((l) => leads.summary(store, l));
  });
  route('POST', /^\/api\/leads$/, async ({ user, body, res }) => {
    if (body.placeId) {
      const { lead, created } = await leads.createFromPlace(store, user, userKey(user, 'googleApiKey'), String(body.placeId));
      if (created && body.importPhotos !== false && (lead.data.fotosGoogle || []).length) {
        await leads.importPhotos(store, media, lead, userKey(user, 'googleApiKey'), body.maxPhotos || 10).catch(() => {});
      }
      res.statusCode = created ? 201 : 200;
      return lead;
    }
    res.statusCode = 201;
    return leads.createManual(store, user, body);
  });
  route('GET', /^\/api\/leads\/([\w-]+)$/, ({ user, params }) => {
    const lead = ownLead(user, params[0]);
    return Object.assign({}, lead, { summary: leads.summary(store, lead) });
  });
  route('PUT', /^\/api\/leads\/([\w-]+)$/, ({ user, params, body }) => leads.update(store, ownLead(user, params[0]), body));
  route('DELETE', /^\/api\/leads\/([\w-]+)$/, async ({ user, params }) => {
    const lead = ownLead(user, params[0]);
    store.remove('leads', (l) => l.id === lead.id);
    await media.removeAll(lead.id).catch((e) => console.error('Erro ao apagar fotos:', e.message));
    return { ok: true };
  });
  route('POST', /^\/api\/leads\/([\w-]+)\/refresh$/, ({ user, params }) =>
    leads.refresh(store, ownLead(user, params[0]), userKey(user, 'googleApiKey')));
  route('POST', /^\/api\/leads\/([\w-]+)\/photos\/import$/, ({ user, params, body }) =>
    leads.importPhotos(store, media, ownLead(user, params[0]), userKey(user, 'googleApiKey'), body.max));
  route('DELETE', /^\/api\/leads\/([\w-]+)\/photos\/([\w.-]+)$/, async ({ user, params }) => {
    const lead = ownLead(user, params[0]);
    const photo = (lead.photos || []).find((p) => p.name === params[1]);
    if (!photo) throw new HttpError(404, 'Foto não encontrada');
    lead.photos = lead.photos.filter((p) => p !== photo);
    await media.remove(photo.url).catch((e) => console.error('Erro ao apagar foto:', e.message));
    store.update('leads', lead.id, lead);
    return { photos: lead.photos };
  });
  route('GET', /^\/api\/leads\/([\w-]+)\/photos\.zip$/, async ({ user, params, res }) => {
    const lead = ownLead(user, params[0]);
    const files = [];
    for (const p of lead.photos || []) {
      const data = await media.read(p.url).catch(() => null);
      if (data) files.push({ name: p.name, data });
    }
    if (!files.length) throw new HttpError(404, 'Nenhuma foto importada');
    const name = pages.slugify(lead.data.nome) || 'fotos';
    send(res, 200, createZip(files), {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="fotos-' + name + '.zip"',
    });
  });
  route('GET', /^\/api\/leads\/([\w-]+)\/sitedata$/, ({ req, user, params }) => {
    const lead = ownLead(user, params[0]);
    const data = sitedata.fromLead(lead);
    return { siteData: data, prompt: sitedata.buildPrompt(absolutize(req, data), lead) };
  });

  // Dados do site / IA
  route('POST', /^\/api\/sitedata\/parse$/, ({ body }) => {
    const data = sitedata.parsePrompt(body.prompt);
    if (!data) throw new HttpError(400, 'Não encontrei os dados no texto colado. Use o botão "Copiar prompt" na prospecção.');
    return { siteData: data };
  });
  route('POST', /^\/api\/ai\/copy$/, async ({ user, body }) => {
    const data = sitedata.clean(body.siteData);
    return ai.generateCopy(userKey(user, 'anthropicApiKey'), data, body.instructions);
  });

  // Modelos
  route('GET', /^\/api\/models$/, ({ user }) => ({
    models: templates.listModels(store),
    variables: templates.VARIABLES,
    pageTemplates: Object.entries(PB.TEMPLATES).map(([id, t]) => ({ id, label: t.label, description: t.description })),
    canManage: user.role === 'admin',
  }));
  route('GET', /^\/api\/models\/([\w:-]+)\/preview$/, ({ res, params }) => {
    const site = templates.buildSite(store, params[0], sitedata.EXAMPLE);
    const page = Object.assign({ title: sitedata.EXAMPLE.nome, siteData: sitedata.EXAMPLE }, site);
    html(res, 200, publish.renderSite(store, page, {}));
  });
  route('GET', /^\/api\/models\/([\w:-]+)\/source$/, ({ params }) => {
    const t = templates.getHtmlTemplate(store, params[0]);
    if (!t) throw new HttpError(404, 'Modelo não encontrado');
    return { id: t.id, name: t.name, description: t.description, html: t.html };
  });
  route('POST', /^\/api\/models$/, ({ body, res }) => {
    res.statusCode = 201;
    const t = templates.saveTemplate(store, body);
    return { id: 'html:' + t.id, name: t.name };
  }, ADMIN);
  route('PUT', /^\/api\/models\/html:([\w-]+)$/, ({ params, body }) => {
    const t = templates.updateTemplate(store, params[0], body);
    if (!t) throw new HttpError(404, 'Modelo não encontrado (modelos que vêm com o sistema ficam na pasta templates/)');
    return { id: 'html:' + t.id, name: t.name };
  }, ADMIN);
  route('DELETE', /^\/api\/models\/html:([\w-]+)$/, ({ params }) => {
    if (!store.remove('templates', (t) => t.id === params[0])) throw new HttpError(404, 'Modelo não encontrado');
    return { ok: true };
  }, ADMIN);
  route('POST', /^\/api\/render$/, ({ res, body }) => {
    // Pré-visualização ao vivo de um site de modelo HTML
    const page = { kind: 'html', templateId: String(body.templateId || ''), siteData: sitedata.clean(body.siteData) };
    html(res, 200, publish.renderSite(store, page, {}));
  });

  // Sites (páginas)
  route('GET', /^\/api\/pages$/, ({ user }) =>
    store.filter('pages', (p) => p.userId === user.id)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map(pageSummary));
  route('POST', /^\/api\/pages$/, async ({ user, body, res }) => {
    res.statusCode = 201;
    // Página em branco / modelo de página simples
    if (!body.modelId) return pages.createPage(store, user.id, body);

    // Site gerado a partir de dados (lead, prompt colado ou dados manuais)
    let data;
    let lead = null;
    if (body.leadId) {
      lead = ownLead(user, body.leadId);
      data = sitedata.fromLead(lead);
    } else if (body.prompt) {
      data = sitedata.parsePrompt(body.prompt);
      if (!data) throw new HttpError(400, 'Não encontrei os dados no texto colado. Use o botão "Copiar prompt" na prospecção.');
    } else {
      data = sitedata.clean(body.siteData || sitedata.EXAMPLE);
    }
    if (body.siteData && body.leadId) data = sitedata.clean(Object.assign({}, data, body.siteData));
    if (body.useAi) {
      const copy = await ai.generateCopy(userKey(user, 'anthropicApiKey'), data, body.aiInstructions);
      data = sitedata.clean(Object.assign({}, data, copy));
    }
    const site = templates.buildSite(store, body.modelId, data);
    return pages.createPage(store, user.id, {
      title: body.title || data.nome,
      slug: body.slug || data.nome,
      leadId: lead ? lead.id : null,
      siteData: data,
      site,
    });
  });
  route('GET', /^\/api\/pages\/([\w-]+)$/, ({ user, params }) => ownPage(user, params[0]));
  route('PUT', /^\/api\/pages\/([\w-]+)$/, ({ user, params, body }) => {
    ownPage(user, params[0]);
    return pages.updatePage(store, params[0], body);
  });
  route('DELETE', /^\/api\/pages\/([\w-]+)$/, ({ user, params }) => {
    const p = ownPage(user, params[0]);
    store.remove('pages', (x) => x.id === p.id);
    store.remove('submissions', (s) => s.pageId === p.id);
    return { ok: true };
  });
  route('POST', /^\/api\/pages\/([\w-]+)\/duplicate$/, ({ user, params, res }) => {
    ownPage(user, params[0]);
    res.statusCode = 201;
    return pages.duplicatePage(store, params[0]);
  });
  route('GET', /^\/api\/pages\/([\w-]+)\/preview$/, ({ user, params, res }) => {
    html(res, 200, publish.renderSite(store, ownPage(user, params[0]), {}));
  });
  route('GET', /^\/api\/pages\/([\w-]+)\/export$/, async ({ req, user, params, res }) => {
    const page = ownPage(user, params[0]);
    const files = await publish.bundle(store, media, page, baseUrl(req));
    const filename = page.slug || 'pagina';
    if (files.length === 1) {
      return send(res, 200, files[0].data, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '.html"',
      });
    }
    send(res, 200, createZip(files.map((f) => ({ name: f.file, data: f.data }))), {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="' + filename + '.zip"',
    });
  });
  route('POST', /^\/api\/pages\/([\w-]+)\/vercel$/, async ({ req, user, params }) => {
    const page = ownPage(user, params[0]);
    const files = await publish.bundle(store, media, page, baseUrl(req));
    const result = await publish.deployToVercel(
      userKey(user, 'vercelToken'), (user.settings || {}).vercelTeamId, publish.vercelProjectName(page.slug), files);
    const fresh = store.get('pages', page.id);
    fresh.vercel = result;
    store.update('pages', page.id, fresh);
    return result;
  });
  route('GET', /^\/api\/pages\/([\w-]+)\/submissions$/, ({ user, params }) => {
    ownPage(user, params[0]);
    return store.filter('submissions', (s) => s.pageId === params[0]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  route('DELETE', /^\/api\/pages\/([\w-]+)\/submissions\/([\w-]+)$/, ({ user, params }) => {
    ownPage(user, params[0]);
    if (!store.remove('submissions', (s) => s.pageId === params[0] && s.id === params[1])) throw new HttpError(404, 'Mensagem não encontrada');
    return { ok: true };
  });

  // ---------- páginas públicas ----------

  async function handlePublic(req, res, slug, rest, query) {
    const page = store.find('pages', (p) => p.slug === slug);
    if (!page || !page.published) return html(res, 404, notFoundPage());

    if (rest === '' && req.method === 'GET') {
      return html(res, 200, publish.renderSite(store, page, {
        sent: query.get('enviado') === '1',
        formAction: '/p/' + page.slug + '/contato',
      }));
    }

    if (rest === 'contato' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      // Campo "website" é armadilha para robôs (honeypot)
      if (!form.get('website')) {
        const name = String(form.get('name') || '').trim().slice(0, 120);
        const email = String(form.get('email') || '').trim().slice(0, 200);
        const message = String(form.get('message') || '').trim().slice(0, 5000);
        if (!name || !email || !message) return html(res, 400, 'Preencha todos os campos.');
        store.insert('submissions', {
          id: crypto.randomUUID(), pageId: page.id, name, email, message, createdAt: new Date().toISOString(),
        });
        await store.flush();
      }
      // Sites hospedados fora (Vercel) voltam para a página de origem
      const back = String(req.headers.referer || '');
      const external = back && !back.startsWith(baseUrl(req)) && /^https:\/\/[\w.-]+\.vercel\.app\//.test(back);
      res.writeHead(303, { Location: external ? back.split('#')[0].split('?')[0] + '?enviado=1' : '/p/' + page.slug + '?enviado=1#contato' });
      return res.end();
    }
    return html(res, 404, notFoundPage());
  }

  async function withStore(fn) {
    const s = await openStore();
    return als.run(s, fn);
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      // Arquivos do painel (css/js/html) não precisam do banco
      if (req.method === 'GET' && /^\/(css|js)\/[\w./-]+\.(css|js)$/.test(pathname) && serveStatic(res, pathname)) return;

      if (problems.length) {
        if (pathname.startsWith('/api/')) return json(res, 503, { error: 'Configuração pendente: ' + problems.join(' · ') });
        return html(res, 503, setupPage(problems));
      }

      const mediaMatch = pathname.match(/^\/m\/([0-9a-f-]{36})\/([a-z0-9-]+\.(?:jpg|png|webp))$/);
      if (mediaMatch && req.method === 'GET') {
        const file = media.file(mediaMatch[1], mediaMatch[2]);
        if (!file) return send(res, 404, 'Não encontrado');
        return serveFile(res, file, 'public, max-age=604800');
      }

      const pub = pathname.match(/^\/p\/([a-z0-9-]+)\/?(.*)$/);
      if (pub) return await withStore(() => handlePublic(req, res, pub[1], pub[2], url.searchParams));

      if (pathname.startsWith('/api/')) {
        let apiPath;
        try {
          apiPath = decodeURIComponent(pathname);
        } catch (e) {
          return json(res, 400, { error: 'Endereço inválido' });
        }
        const r = routes.find((x) => x.method === req.method && x.pattern.test(apiPath));
        if (!r) return json(res, 404, { error: 'Rota não encontrada' });
        const m = apiPath.match(r.pattern);
        const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
        return await withStore(async () => {
          const user = auth.userFromRequest(store, req);
          if (!r.opts.public && !user) return json(res, 401, { error: 'Faça login para continuar' });
          if (r.opts.admin && user.role !== 'admin') return json(res, 403, { error: 'Apenas administradores' });
          const out = await r.handler({ req, res, user, body, params: m.slice(1), query: url.searchParams });
          await store.flush();
          if (out !== undefined && !res.writableEnded) json(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, out);
        });
      }

      if (req.method === 'GET' && serveStatic(res, pathname)) return;
      return html(res, 404, notFoundPage());
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof pages.ValidationError || err instanceof auth.AuthError || err instanceof templates.TemplateError) {
        return json(res, 400, { error: err.message });
      }
      if (err.status) return json(res, err.status, { error: err.message });
      console.error(err);
      json(res, 500, { error: 'Erro interno' });
    }
  };
}

/** Servidor HTTP tradicional com um armazenamento fixo (arquivo ou memória). */
function createApp(store, options) {
  const handler = createHandler(Object.assign({}, options, { openStore: async () => store }));
  return http.createServer(handler);
}

module.exports = { createApp, createHandler, DEFAULT_OUTREACH };
