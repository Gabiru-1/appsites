'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { withServer, client, signup, installFakeApis, FAKE_JPEG } = require('./helpers.js');

let fake;
test.before(() => { fake = installFakeApis(); });
test.after(() => fake.restore());

async function setupUser(base) {
  const c = await signup(base, 'ana@x.com', 'Ana');
  await c.json('PUT', '/api/settings', { googleApiKey: 'google-key-ok', vercelToken: 'vercel-ok' });
  return c;
}

test('configurações: chaves ficam criptografadas e mascaradas', () => withServer({}, async (base, store) => {
  const c = await setupUser(base);
  const s = (await c.json('GET', '/api/settings')).data;
  assert.strictEqual(s.hasGoogle, true);
  assert.strictEqual(s.googleApiKey, '••••••y-ok', 'só o final aparece');
  assert.ok(!JSON.stringify(await store.allAsync('users')).includes('google-key-ok'), 'chave não fica em texto puro');

  // Reenviar o valor mascarado não apaga a chave
  await c.json('PUT', '/api/settings', { googleApiKey: s.googleApiKey });
  assert.strictEqual((await c.json('GET', '/api/settings')).data.hasGoogle, true);
}));

test('prospecção: busca com filtros', () => withServer({}, async (base) => {
  const c = await setupUser(base);
  let r = await c.json('POST', '/api/prospect/search', { niche: 'pizzaria', location: 'Curitiba PR', website: 'any', phone: 'any', minRating: 4 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.results.length, 4);
  const sent = JSON.parse(fake.google.calls.at(-1).init.body);
  assert.strictEqual(sent.textQuery, 'pizzaria em Curitiba PR');
  assert.strictEqual(sent.minRating, 4);
  assert.strictEqual(sent.languageCode, 'pt-BR');

  r = await c.json('POST', '/api/prospect/search', { niche: 'pizzaria', website: 'without', phone: 'with', minReviews: 10 });
  assert.deepStrictEqual(r.data.results.map((p) => p.placeId), ['aaa111'], 'sem site, com telefone, 10+ avaliações');
  assert.strictEqual(r.data.results[0].cidade, 'Curitiba - PR');
  assert.ok(r.data.results[0].fotoCapa.startsWith('places/aaa111/photos/'));

  r = await c.json('POST', '/api/prospect/search', { niche: '' });
  assert.strictEqual(r.status, 400);
}));

test('prospecção sem chave do Google mostra erro claro', () => withServer({}, async (base) => {
  const c = await signup(base, 'ana@x.com');
  const r = await c.json('POST', '/api/prospect/search', { niche: 'pizzaria' });
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /chave da API do Google/);

  await c.json('PUT', '/api/settings', { googleApiKey: 'chave-errada' });
  const r2 = await c.json('POST', '/api/prospect/search', { niche: 'pizzaria' });
  assert.strictEqual(r2.status, 400);
  assert.match(r2.data.error, /API key not valid/);
}));

test('lead: salvar, importar fotos, zip, prompt, status e venda', () => withServer({}, async (base, store) => {
  const c = await setupUser(base);
  let r = await c.json('POST', '/api/leads', { placeId: 'aaa111' });
  assert.strictEqual(r.status, 201);
  const lead = r.data;
  assert.strictEqual(lead.data.nome, 'Pizzaria aaa111');
  assert.strictEqual(lead.data.avaliacoes.length, 2);
  assert.strictEqual(lead.photos.length, 2, 'fotos importadas automaticamente');
  assert.strictEqual(lead.photos[0].autor, 'Fulano');

  // Salvar de novo não duplica
  r = await c.json('POST', '/api/leads', { placeId: 'aaa111' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.id, lead.id);

  // A busca marca o que já foi salvo
  r = await c.json('POST', '/api/prospect/search', { niche: 'pizzaria' });
  assert.strictEqual(r.data.results.find((p) => p.placeId === 'aaa111').leadId, lead.id);

  // Foto pública e .zip
  const photo = await client(base).req('GET', lead.photos[0].url);
  assert.strictEqual(photo.status, 200);
  assert.deepStrictEqual(Buffer.from(await photo.arrayBuffer()), FAKE_JPEG);
  const zip = await c.req('GET', '/api/leads/' + lead.id + '/photos.zip');
  assert.strictEqual(zip.status, 200);
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.strictEqual(buf.readUInt32LE(0), 0x04034b50, 'assinatura ZIP');
  assert.ok(buf.includes(Buffer.from('foto-1.jpg')));

  // Prompt
  r = await c.json('GET', '/api/leads/' + lead.id + '/sitedata');
  assert.match(r.data.prompt, /Pizzaria aaa111/);
  assert.match(r.data.prompt, /Pizza maravilhosa!/);
  assert.match(r.data.prompt, /https:\/\/wa\.me\/5541999990000/);
  assert.match(r.data.prompt, /http:\/\/127\.0\.0\.1:\d+\/m\//, 'fotos com endereço completo');
  assert.ok(!r.data.prompt.includes('Demorou'), 'avaliações ruins ficam de fora');
  assert.strictEqual(r.data.siteData.horarios[0].dia, 'Segunda-feira');

  // Status e venda
  r = await c.json('PUT', '/api/leads/' + lead.id, { status: 'vendido', valor: '1500,50', mensalidade: 89.9 });
  assert.strictEqual(r.data.status, 'vendido');
  assert.strictEqual(r.data.valor, 1500.5);
  assert.match(r.data.vendidoEm, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(r.data.history.length, 2);
  assert.strictEqual((await c.json('PUT', '/api/leads/' + lead.id, { status: 'xyz' })).status, 400);

  const dash = (await c.json('GET', '/api/dashboard')).data;
  assert.strictEqual(dash.vendas, 1);
  assert.strictEqual(dash.faturamentoMes, 1500.5);
  assert.strictEqual(dash.recorrenciaMensal, 89.9);
  assert.strictEqual(dash.conversao, 1);
  assert.strictEqual(dash.meses.length, 6);
  assert.strictEqual(dash.meses[5].valor, 1500.5);

  // Outro usuário não vê o lead nem as fotos via API
  const bia = await signup(base, 'bia@x.com');
  assert.strictEqual((await bia.json('GET', '/api/leads/' + lead.id)).status, 404);
  assert.strictEqual((await bia.req('GET', '/api/leads/' + lead.id + '/photos.zip')).status, 404);

  // Excluir remove as fotos
  await c.json('DELETE', '/api/leads/' + lead.id);
  assert.strictEqual((await client(base).req('GET', lead.photos[0].url)).status, 404);
}));

test('criar site a partir do lead (modelo de blocos e modelo HTML) e publicar na Vercel', () => withServer({}, async (base) => {
  const c = await setupUser(base);
  const lead = (await c.json('POST', '/api/leads', { placeId: 'aaa111' })).data;

  // Modelo de blocos
  let r = await c.json('POST', '/api/pages', { leadId: lead.id, modelId: 'blocks:escuro' });
  assert.strictEqual(r.status, 201);
  const site = r.data;
  assert.strictEqual(site.kind, 'blocks');
  assert.strictEqual(site.leadId, lead.id);
  assert.strictEqual(site.slug, 'pizzaria-aaa111');
  const types = site.blocks.map((b) => b.type);
  for (const t of ['hero', 'reviews', 'hours', 'map', 'contactInfo', 'gallery']) assert.ok(types.includes(t), t);
  assert.strictEqual(site.blocks[0].data.bgImage, lead.photos[0].url, 'foto do lead no banner');
  assert.strictEqual(site.settings.whatsapp, '5541999990000');

  // Modelo HTML
  r = await c.json('POST', '/api/pages', { leadId: lead.id, modelId: 'html:exemplo-moderno', title: 'Versão HTML' });
  const htmlSite = r.data;
  assert.strictEqual(htmlSite.kind, 'html');
  let preview = await (await c.req('GET', '/api/pages/' + htmlSite.id + '/preview')).text();
  assert.match(preview, /Pizzaria aaa111/);
  assert.match(preview, /Pizza maravilhosa!/);
  assert.ok(!preview.includes('{{'), 'todas as variáveis substituídas');

  // Editar dados do site HTML
  r = await c.json('PUT', '/api/pages/' + htmlSite.id, { siteData: Object.assign({}, htmlSite.siteData, { titulo: 'A melhor pizza <b>' }) });
  preview = await (await c.req('GET', '/api/pages/' + htmlSite.id + '/preview')).text();
  assert.match(preview, /A melhor pizza &lt;b&gt;/, 'conteúdo escapado');

  // Publicar na Vercel: envia o HTML e as fotos
  r = await c.json('POST', '/api/pages/' + site.id + '/vercel');
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.url, 'https://site-pizzaria-aaa111.vercel.app');
  const call = fake.vercel.calls.at(-1);
  const files = call.body.files.map((f) => f.file);
  assert.ok(files.includes('index.html'));
  assert.ok(files.some((f) => /^img\/.+foto-1\.jpg$/.test(f)), 'fotos incluídas');
  const index = Buffer.from(call.body.files.find((f) => f.file === 'index.html').data, 'base64').toString();
  assert.ok(!index.includes('/m/'), 'links das fotos reescritos para img/');
  assert.strictEqual((await c.json('GET', '/api/pages')).data.find((p) => p.id === site.id).vercel.url, r.data.url);

  // Exportar em .zip (HTML + fotos)
  const exp = await c.req('GET', '/api/pages/' + site.id + '/export');
  assert.strictEqual(exp.headers.get('content-type'), 'application/zip');

  // Token errado
  await c.json('PUT', '/api/settings', { vercelToken: 'ruim' });
  r = await c.json('POST', '/api/pages/' + site.id + '/vercel');
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /Vercel/);
}));

test('criar site colando o prompt', () => withServer({}, async (base) => {
  const c = await setupUser(base);
  const lead = (await c.json('POST', '/api/leads', { placeId: 'aaa111' })).data;
  const { prompt } = (await c.json('GET', '/api/leads/' + lead.id + '/sitedata')).data;

  let r = await c.json('POST', '/api/sitedata/parse', { prompt });
  assert.strictEqual(r.data.siteData.nome, 'Pizzaria aaa111');

  r = await c.json('POST', '/api/pages', { prompt, modelId: 'blocks:classico' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.blocks[0].data.title, 'Pizzaria aaa111');

  r = await c.json('POST', '/api/pages', { prompt: 'texto qualquer', modelId: 'blocks:classico' });
  assert.strictEqual(r.status, 400);
}));

test('modelos: listar, pré-visualizar e enviar HTML (somente admin)', () => withServer({}, async (base) => {
  const admin = await signup(base, 'admin@x.com');
  const user = await signup(base, 'user@x.com');
  let r = await admin.json('GET', '/api/models');
  assert.ok(r.data.models.length >= 5);
  assert.strictEqual(r.data.canManage, true);

  for (const m of r.data.models) {
    const res = await admin.req('GET', '/api/models/' + encodeURIComponent(m.id) + '/preview');
    assert.strictEqual(res.status, 200, m.id);
  }

  const html = '<html><body><h1>{{titulo}}</h1>{{#fotos}}<img src="{{url}}">{{/fotos}}</body></html>';
  assert.strictEqual((await user.json('POST', '/api/models', { name: 'X', html })).status, 403);
  r = await admin.json('POST', '/api/models', { name: 'Meu modelo', html });
  assert.strictEqual(r.status, 201);
  const id = r.data.id;
  assert.strictEqual((await admin.json('POST', '/api/models', { name: 'Ruim', html: '<div>{{#a}} sem fechar</div>' })).status, 400);

  const preview = await (await user.req('GET', '/api/models/' + encodeURIComponent(id) + '/preview')).text();
  assert.match(preview, /<h1>A verdadeira pizza napolitana em Curitiba<\/h1>/);

  // Usuário comum pode usar o modelo
  r = await user.json('POST', '/api/pages', { modelId: id, siteData: { nome: 'Loja', titulo: 'Olá' } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await user.json('DELETE', '/api/models/' + encodeURIComponent(id))).status, 403);
  assert.strictEqual((await admin.json('DELETE', '/api/models/' + encodeURIComponent(id))).status, 200);
}));
