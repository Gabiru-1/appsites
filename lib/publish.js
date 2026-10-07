'use strict';

const fs = require('fs');
const { renderPage } = require('../public/js/render.js');
const templates = require('./templates.js');

class PublishError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 502;
  }
}

/** HTML final do site (blocos ou modelo HTML). */
function renderSite(store, page, ctx) {
  ctx = ctx || {};
  if (page.kind === 'html') {
    let html = templates.renderHtmlSite(store, page.templateId, page.siteData || {});
    if (ctx.sent) {
      html = html.replace(/<body([^>]*)>/i, '<body$1><div style="position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:12px 20px;border-radius:10px;z-index:9999;font-family:system-ui">Mensagem enviada! Obrigado.</div>');
    }
    return html;
  }
  return renderPage(page, ctx);
}

/**
 * Monta os arquivos de um site estático: index.html + fotos locais em img/.
 * baseUrl (opcional): endereço público do sistema, para o formulário de contato continuar funcionando.
 */
function bundle(store, media, page, baseUrl) {
  const formAction = baseUrl ? baseUrl.replace(/\/$/, '') + '/p/' + page.slug + '/contato' : '';
  let html = renderSite(store, page, { formAction });
  const files = [];
  const seen = new Map();
  html = html.replace(/\/m\/([0-9a-f-]{36})\/([a-z0-9-]+\.(?:jpg|png|webp))/g, (match, leadId, name) => {
    const file = media.resolveUrl(match);
    if (!file) return baseUrl ? baseUrl.replace(/\/$/, '') + match : match;
    if (!seen.has(match)) {
      const target = 'img/' + leadId.slice(0, 8) + '-' + name;
      seen.set(match, target);
      files.push({ file: target, data: fs.readFileSync(file) });
    }
    return seen.get(match);
  });
  files.unshift({ file: 'index.html', data: Buffer.from(html, 'utf8') });
  return files;
}

function vercelProjectName(slug) {
  return ('site-' + String(slug || 'pagina'))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 90)
    .replace(/-+$/, '');
}

/**
 * Publica na Vercel (https://vercel.com/docs/rest-api/endpoints/deployments).
 * Usa o token do próprio usuário (Configurações → Vercel).
 */
async function deployToVercel(token, teamId, projectName, files) {
  if (!token) throw new PublishError('Configure seu token da Vercel em Configurações', 400);
  const body = {
    name: projectName,
    target: 'production',
    projectSettings: { framework: null },
    files: files.map((f) => ({
      file: f.file,
      data: f.data.toString('base64'),
      encoding: 'base64',
    })),
  };
  const url = 'https://api.vercel.com/v13/deployments' + (teamId ? '?teamId=' + encodeURIComponent(teamId) : '');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new PublishError('Não foi possível conectar à Vercel: ' + e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || 'erro ' + res.status;
    throw new PublishError('Vercel: ' + msg, res.status === 401 || res.status === 403 ? 400 : 502);
  }
  const aliases = Array.isArray(data.alias) ? data.alias : [];
  return {
    id: data.id,
    url: 'https://' + (aliases[0] || projectName + '.vercel.app'),
    deploymentUrl: data.url ? 'https://' + data.url : '',
    readyState: data.readyState || '',
    deployedAt: new Date().toISOString(),
  };
}

module.exports = { renderSite, bundle, deployToVercel, vercelProjectName, PublishError };
