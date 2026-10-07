'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderMustache } = require('../lib/templates.js');
const sitedata = require('../lib/sitedata.js');
const { createZip, crc32 } = require('../lib/zip.js');
const ai = require('../lib/ai.js');

test('mustache: variáveis, seções, listas e escape', () => {
  const out = renderMustache('{{a}}|{{{a}}}|{{#l}}[{{x}}{{indice}}]{{/l}}|{{^vazio}}nada{{/vazio}}|{{#l.length}}tem{{/l.length}}|{{o.p}}', {
    a: '<b>', l: [{ x: 'um' }, { x: 'dois' }], vazio: [], o: { p: 'ok' },
  });
  assert.strictEqual(out, '&lt;b&gt;|<b>|[um1][dois2]|nada|tem|ok');
  assert.throws(() => renderMustache('{{#a}}', {}), /não foi fechada/);
  assert.throws(() => renderMustache('{{/a}}', {}), /sem abrir/);
});

test('dados do site: WhatsApp, prompt e leitura do prompt colado', () => {
  assert.strictEqual(sitedata.whatsappNumber({ telefone: '(11) 98888-7777' }), '5511988887777');
  assert.strictEqual(sitedata.whatsappNumber({ telefoneInternacional: '+55 21 3333-4444' }), '552133334444');

  const prompt = sitedata.buildPrompt(sitedata.EXAMPLE, { data: { website: '' } });
  assert.match(prompt, /Pizzaria Bella Napoli/);
  const parsed = sitedata.parsePrompt('blá blá\n' + prompt + '\nmais texto');
  assert.strictEqual(parsed.nome, 'Pizzaria Bella Napoli');
  assert.strictEqual(parsed.servicos.length, 3);
  assert.strictEqual(sitedata.parsePrompt('nada aqui'), null);
  assert.strictEqual(sitedata.parsePrompt(JSON.stringify({ nome: 'Direto' })).nome, 'Direto');

  const clean = sitedata.clean({ nome: 'x'.repeat(500), corPrincipal: 'red;}', whatsapp: '+55 (11) 9' });
  assert.strictEqual(clean.nome.length, 120);
  assert.strictEqual(clean.corPrincipal, '');
  assert.strictEqual(clean.whatsapp, '55119');
});

test('zip: estrutura válida', () => {
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);
  const zip = createZip([{ name: 'a.txt', data: Buffer.from('oi') }, { name: 'pasta/b.txt', data: Buffer.from('tchau') }]);
  assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);
  const end = zip.length - 22;
  assert.strictEqual(zip.readUInt32LE(end), 0x06054b50);
  assert.strictEqual(zip.readUInt16LE(end + 10), 2);
});

test('IA: envia o pedido certo e lê o JSON', async () => {
  let sent;
  const fakeClient = {
    beta: {
      messages: {
        create: async (params) => {
          sent = params;
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ titulo: 'T', subtitulo: 'S', sobre: 'A', servicos: [], cta: 'C', corPrincipal: '#111111' }) }],
          };
        },
      },
    },
  };
  const out = await ai.generateCopy('chave', sitedata.EXAMPLE, 'foco em delivery', { client: fakeClient });
  assert.strictEqual(out.titulo, 'T');
  assert.strictEqual(sent.model, 'claude-opus-5-5');
  assert.strictEqual(sent.fallbacks, 'default');
  assert.deepStrictEqual(sent.betas, ['server-side-fallback-2026-07-01']);
  assert.strictEqual(sent.output_config.format.type, 'json_schema');
  assert.match(sent.messages[0].content, /foco em delivery/);
  assert.match(sent.messages[0].content, /A melhor pizza da cidade/);

  const refusing = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(ai.generateCopy('chave', sitedata.EXAMPLE, '', { client: refusing }), /recusou/);

  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(ai.generateCopy('', sitedata.EXAMPLE), /Configure sua chave da Anthropic/);
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
});

test('PgStore: grava só o que mudou e apaga o que foi removido', async () => {
  const { PgStore } = require('../lib/pgstore.js');
  const { fakeSql } = require('./helpers.js');
  const sql = fakeSql();

  let s = await PgStore.open(sql);
  s.insert('pages', { id: 'p1', title: 'Um' });
  s.insert('pages', { id: 'p2', title: 'Dois' });
  assert.strictEqual(await s.flush(), 2);
  assert.strictEqual(await s.flush(), 0, 'nada mudou');

  s = await PgStore.open(sql);
  assert.strictEqual(s.all('pages').length, 2);
  s.get('pages', 'p1').title = 'Um editado'; // alteração direta no objeto também é detectada
  s.remove('pages', (p) => p.id === 'p2');
  assert.strictEqual(await s.flush(), 2);

  s = await PgStore.open(sql);
  assert.deepStrictEqual(s.all('pages'), [{ id: 'p1', title: 'Um editado' }]);
});

test('Supabase Storage: cria o bucket, envia, lê e apaga fotos', async () => {
  const { createSupabaseMedia } = require('../lib/media.js');
  const objects = new Map();
  let buckets = [];
  const base = 'https://proj.supabase.co/storage/v1/object/public/appsites-media/';
  const fakeClient = {
    storage: {
      async getBucket(id) { return buckets.includes(id) ? { data: { id }, error: null } : { data: null, error: { message: 'Bucket not found' } }; },
      async createBucket(id, opts) { assert.strictEqual(opts.public, true); buckets.push(id); return { data: { name: id }, error: null }; },
      from() {
        return {
          async upload(p, buf, o) { objects.set(p, { buf, type: o.contentType }); return { data: { path: p }, error: null }; },
          getPublicUrl(p) { return { data: { publicUrl: base + p } }; },
          async remove(paths) { paths.forEach((p) => objects.delete(p)); return { data: [], error: null }; },
          async list(prefix) { return { data: [...objects.keys()].filter((k) => k.startsWith(prefix + '/')).map((k) => ({ name: k.slice(prefix.length + 1) })), error: null }; },
        };
      },
    },
  };
  const media = createSupabaseMedia('https://proj.supabase.co', 'chave', { client: fakeClient });
  const lead = '11111111-2222-3333-4444-555555555555';
  const url = await media.save(lead, 'foto-1.jpg', Buffer.from('x'), 'image/jpeg');
  assert.deepStrictEqual(buckets, ['appsites-media'], 'bucket criado na primeira foto');
  assert.ok(url.startsWith(base + 'media/' + lead + '/foto-1-'));
  await media.save(lead, 'foto-2.png', Buffer.from('y'), 'image/png');
  assert.strictEqual(buckets.length, 1, 'bucket criado só uma vez');
  assert.strictEqual(objects.size, 2);

  await media.remove(url);
  assert.strictEqual(objects.size, 1);
  await media.removeAll(lead);
  assert.strictEqual(objects.size, 0);
  assert.strictEqual(await media.read('https://outro-site.com/x.jpg'), null, 'não lê URLs de fora');
});
