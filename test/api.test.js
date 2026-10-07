'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../lib/store.js');
const { createApp } = require('../lib/app.js');

async function withServer(options, fn) {
  const store = new Store(null);
  const server = createApp(store, options);
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await fn(base, store);
  } finally {
    server.close();
  }
}

function req(base, method, path, body, headers) {
  return fetch(base + path, {
    method,
    redirect: 'manual',
    headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, headers || {}),
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('fluxo completo: criar, editar, publicar, visualizar e excluir', () => withServer({}, async (base) => {
  let res = await req(base, 'POST', '/api/pages', { title: 'Minha Página Ótima', template: 'landing' });
  assert.strictEqual(res.status, 201);
  const page = await res.json();
  assert.strictEqual(page.slug, 'minha-pagina-otima');
  assert.ok(page.blocks.length > 0);
  assert.strictEqual(page.published, false);

  // Não publicada → 404
  res = await req(base, 'GET', '/p/' + page.slug);
  assert.strictEqual(res.status, 404);

  // Edita blocos e publica
  const blocks = [{ id: 'abc', type: 'heading', data: { text: 'Olá mundo', evil: 'x' } }];
  res = await req(base, 'PUT', '/api/pages/' + page.id, { blocks, published: true, title: 'Novo título' });
  assert.strictEqual(res.status, 200);
  const updated = await res.json();
  assert.strictEqual(updated.title, 'Novo título');
  assert.deepStrictEqual(updated.blocks[0].data, { text: 'Olá mundo' }, 'campos desconhecidos são removidos');

  res = await req(base, 'GET', '/p/' + page.slug);
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /Olá mundo/);

  // Lista
  res = await req(base, 'GET', '/api/pages');
  const list = await res.json();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].blockCount, 1);

  // Exporta
  res = await req(base, 'GET', '/api/pages/' + page.id + '/export');
  assert.match(res.headers.get('content-disposition'), /minha-pagina-otima\.html/);

  // Duplica
  res = await req(base, 'POST', '/api/pages/' + page.id + '/duplicate');
  const copy = await res.json();
  assert.notStrictEqual(copy.id, page.id);
  assert.notStrictEqual(copy.slug, page.slug);
  assert.strictEqual(copy.published, false);

  // Exclui
  res = await req(base, 'DELETE', '/api/pages/' + page.id);
  assert.strictEqual(res.status, 200);
  res = await req(base, 'GET', '/api/pages/' + page.id);
  assert.strictEqual(res.status, 404);
}));

test('valida slug e blocos', () => withServer({}, async (base) => {
  const a = await (await req(base, 'POST', '/api/pages', { title: 'A' })).json();
  const b = await (await req(base, 'POST', '/api/pages', { title: 'A' })).json();
  assert.strictEqual(b.slug, 'a-2');

  let res = await req(base, 'PUT', '/api/pages/' + b.id, { slug: 'a' });
  assert.strictEqual(res.status, 400);
  res = await req(base, 'PUT', '/api/pages/' + b.id, { slug: 'api' });
  assert.strictEqual(res.status, 400);
  res = await req(base, 'PUT', '/api/pages/' + b.id, { slug: 'Página Nova!' });
  assert.strictEqual((await res.json()).slug, 'pagina-nova');

  res = await req(base, 'PUT', '/api/pages/' + a.id, { blocks: [{ type: 'naoexiste' }] });
  assert.strictEqual(res.status, 400);
  res = await req(base, 'PUT', '/api/pages/' + a.id, { blocks: 'x' });
  assert.strictEqual(res.status, 400);
}));

test('formulário de contato salva mensagens', () => withServer({}, async (base, store) => {
  const page = await (await req(base, 'POST', '/api/pages', { title: 'Contato', template: 'landing' })).json();
  await req(base, 'PUT', '/api/pages/' + page.id, { published: true });

  let res = await fetch(base + '/p/contato/contato', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Ana', email: 'ana@ex.com', message: 'Oi!' }).toString(),
  });
  assert.strictEqual(res.status, 303);
  assert.match(res.headers.get('location'), /enviado=1/);

  // Robôs (honeypot preenchido) são ignorados silenciosamente
  await fetch(base + '/p/contato/contato', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Bot', email: 'b@b.com', message: 'spam', website: 'x' }).toString(),
  });

  res = await req(base, 'GET', '/api/pages/' + page.id + '/submissions');
  const subs = await res.json();
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].name, 'Ana');

  res = await req(base, 'GET', '/p/contato?enviado=1');
  assert.match(await res.text(), /pb-success/);
}));

test('senha de administrador protege o painel, mas não as páginas publicadas', () => withServer({ adminPassword: 'segredo' }, async (base, store) => {
  let res = await req(base, 'GET', '/api/pages');
  assert.strictEqual(res.status, 401);
  res = await req(base, 'GET', '/');
  assert.strictEqual(res.status, 401);

  const auth = { Authorization: 'Basic ' + Buffer.from('admin:segredo').toString('base64') };
  res = await req(base, 'POST', '/api/pages', { title: 'Pub' }, auth);
  const page = await res.json();
  await req(base, 'PUT', '/api/pages/' + page.id, { published: true }, auth);

  res = await req(base, 'GET', '/p/pub');
  assert.strictEqual(res.status, 200);
}));

test('arquivos estáticos não permitem path traversal', () => withServer({}, async (base) => {
  const res = await req(base, 'GET', '/..%2f..%2fpackage.json');
  assert.strictEqual(res.status, 404);
  const ok = await req(base, 'GET', '/js/render.js');
  assert.strictEqual(ok.status, 200);
}));
