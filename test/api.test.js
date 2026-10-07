'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { withServer, client, signup } = require('./helpers.js');

test('login: cadastro, sessão, logout e senha', () => withServer({}, async (base, store) => {
  const anon = client(base);
  assert.strictEqual((await anon.json('GET', '/api/pages')).status, 401);
  assert.strictEqual((await anon.json('GET', '/api/auth/config')).data.hasUsers, false);

  let r = await anon.json('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.com', password: '123' });
  assert.strictEqual(r.status, 400, 'senha curta é recusada');

  const ana = await signup(base, 'Ana@X.com', 'Ana');
  r = await ana.json('GET', '/api/auth/me');
  assert.strictEqual(r.data.user.email, 'ana@x.com');
  assert.strictEqual(r.data.user.role, 'admin', 'primeiro usuário vira admin');
  assert.ok(!('password' in r.data.user));
  assert.ok((await store.allAsync('users'))[0].password.startsWith('scrypt$'));

  const bia = await signup(base, 'bia@x.com', 'Bia');
  assert.strictEqual((await bia.json('GET', '/api/auth/me')).data.user.role, 'user');

  r = await client(base).json('POST', '/api/auth/register', { name: 'Ana 2', email: 'ana@x.com', password: 'outrasenha1' });
  assert.strictEqual(r.status, 400, 'e-mail duplicado');

  const again = client(base);
  r = await again.json('POST', '/api/auth/login', { email: 'ana@x.com', password: 'errada-123' });
  assert.strictEqual(r.status, 400);
  r = await again.json('POST', '/api/auth/login', { email: 'ana@x.com', password: 'senha-segura-123' });
  assert.strictEqual(r.status, 200);

  r = await again.json('POST', '/api/account/password', { current: 'senha-segura-123', next: 'nova-senha-123' });
  assert.strictEqual(r.status, 200);
  await again.json('POST', '/api/auth/logout');
  assert.strictEqual((await again.json('GET', '/api/auth/me')).status, 401);
  r = await again.json('POST', '/api/auth/login', { email: 'ana@x.com', password: 'nova-senha-123' });
  assert.strictEqual(r.status, 200);
}));

test('cadastro pode ser desativado depois do primeiro usuário', () => withServer({ allowSignup: false }, async (base) => {
  await signup(base, 'admin@x.com');
  const r = await client(base).json('POST', '/api/auth/register', { name: 'X', email: 'x@x.com', password: 'senha-segura-123' });
  assert.strictEqual(r.status, 403);
}));

test('cada usuário vê apenas as próprias páginas', () => withServer({}, async (base) => {
  const ana = await signup(base, 'ana@x.com');
  const bia = await signup(base, 'bia@x.com');
  const page = (await ana.json('POST', '/api/pages', { title: 'Da Ana', template: 'landing' })).data;

  assert.strictEqual((await bia.json('GET', '/api/pages')).data.length, 0);
  assert.strictEqual((await bia.json('GET', '/api/pages/' + page.id)).status, 404);
  assert.strictEqual((await bia.json('PUT', '/api/pages/' + page.id, { title: 'roubado' })).status, 404);
  assert.strictEqual((await bia.json('DELETE', '/api/pages/' + page.id)).status, 404);
  assert.strictEqual((await ana.json('GET', '/api/pages')).data.length, 1);
}));

test('páginas: criar, editar, publicar, visualizar, duplicar e excluir', () => withServer({}, async (base) => {
  const c = await signup(base, 'ana@x.com');
  let r = await c.json('POST', '/api/pages', { title: 'Minha Página Ótima', template: 'landing' });
  assert.strictEqual(r.status, 201);
  const page = r.data;
  assert.strictEqual(page.slug, 'minha-pagina-otima');

  assert.strictEqual((await client(base).req('GET', '/p/' + page.slug)).status, 404, 'rascunho não é público');

  const blocks = [{ id: 'abc', type: 'heading', data: { text: 'Olá mundo', evil: 'x' } }];
  r = await c.json('PUT', '/api/pages/' + page.id, { blocks, published: true });
  assert.deepStrictEqual(r.data.blocks[0].data, { text: 'Olá mundo' });

  const pub = await client(base).req('GET', '/p/' + page.slug);
  assert.strictEqual(pub.status, 200);
  assert.match(await pub.text(), /Olá mundo/);

  r = await c.json('POST', '/api/pages/' + page.id + '/duplicate');
  assert.notStrictEqual(r.data.slug, page.slug);
  assert.strictEqual(r.data.published, false);

  r = await c.json('PUT', '/api/pages/' + page.id, { slug: 'api' });
  assert.strictEqual(r.status, 400);
  r = await c.json('PUT', '/api/pages/' + page.id, { blocks: [{ type: 'naoexiste' }] });
  assert.strictEqual(r.status, 400);

  assert.strictEqual((await c.json('DELETE', '/api/pages/' + page.id)).status, 200);
}));

test('formulário de contato salva mensagens', () => withServer({}, async (base) => {
  const c = await signup(base, 'ana@x.com');
  const page = (await c.json('POST', '/api/pages', { title: 'Contato', template: 'landing' })).data;
  await c.json('PUT', '/api/pages/' + page.id, { published: true });
  const anon = client(base);
  const form = (o) => new URLSearchParams(o).toString();
  const ct = { 'Content-Type': 'application/x-www-form-urlencoded' };

  let res = await anon.req('POST', '/p/contato/contato', form({ name: 'Ana', email: 'a@b.com', message: 'Oi!' }), ct);
  assert.strictEqual(res.status, 303);
  await anon.req('POST', '/p/contato/contato', form({ name: 'Bot', email: 'b@b.com', message: 'spam', website: 'x' }), ct);

  const subs = (await c.json('GET', '/api/pages/' + page.id + '/submissions')).data;
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].name, 'Ana');
  assert.match(await (await anon.req('GET', '/p/contato?enviado=1')).text(), /pb-success/);
}));

test('arquivos estáticos e rotas da interface', () => withServer({}, async (base) => {
  const anon = client(base);
  assert.strictEqual((await anon.req('GET', '/..%2f..%2fpackage.json')).status, 404);
  assert.strictEqual((await anon.req('GET', '/js/render.js')).status, 200);
  for (const p of ['/', '/login', '/editor', '/site']) {
    const res = await anon.req('GET', p);
    assert.strictEqual(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
}));

test('login bloqueia após muitas tentativas erradas', () => withServer({}, async (base) => {
  await signup(base, 'ana@x.com');
  const c = client(base);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual((await c.json('POST', '/api/auth/login', { email: 'ana@x.com', password: 'errada-' + i })).status, 400);
  }
  const r = await c.json('POST', '/api/auth/login', { email: 'ana@x.com', password: 'senha-segura-123' });
  assert.strictEqual(r.status, 429);
}));
