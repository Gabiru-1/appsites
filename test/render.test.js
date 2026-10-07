'use strict';

const test = require('node:test');
const assert = require('node:assert');
const PB = require('../public/js/blocks.js');
const R = require('../public/js/render.js');

test('renderiza todos os tipos de bloco com valores padrão', () => {
  const blocks = Object.keys(PB.BLOCKS).map((t) => PB.createBlock(t));
  const html = R.renderPage({ title: 'Teste', settings: {}, blocks });
  for (const t of Object.keys(PB.BLOCKS)) {
    assert.match(html, new RegExp('pb-block-' + t + '\\b'), 'bloco ' + t + ' deveria aparecer');
  }
  assert.match(html, /^<!doctype html>/);
});

test('todos os modelos geram páginas válidas', () => {
  for (const [id, tpl] of Object.entries(PB.TEMPLATES)) {
    const built = tpl.build();
    assert.ok(Array.isArray(built.blocks), id);
    const html = R.renderPage({ title: id, settings: built.settings, blocks: built.blocks });
    assert.ok(html.includes('</html>'), id);
  }
});

test('escapa HTML do conteúdo do usuário', () => {
  const block = PB.createBlock('heading', { text: '<script>alert(1)</script>' });
  const html = R.renderPage({ title: '<b>x</b>', blocks: [block] });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<title>&lt;b&gt;x&lt;/b&gt;</title>'));
});

test('bloqueia URLs perigosas', () => {
  assert.strictEqual(R.safeUrl('javascript:alert(1)'), '#');
  assert.strictEqual(R.safeUrl(' JaVaScRiPt:alert(1)'), '#');
  assert.strictEqual(R.safeUrl('data:text/html,oi'), '#');
  assert.strictEqual(R.safeUrl('https://ok.com'), 'https://ok.com');
  assert.strictEqual(R.safeUrl('exemplo.com.br/pagina'), 'https://exemplo.com.br/pagina');
  assert.strictEqual(R.safeUrl('#contato'), '#contato');
  assert.strictEqual(R.safeUrl('mailto:a@b.com'), 'mailto:a@b.com');

  const btn = PB.createBlock('button', { url: 'javascript:alert(1)' });
  assert.ok(!R.renderPage({ blocks: [btn] }).includes('javascript:'));
});

test('markdown simples no texto não permite links perigosos', () => {
  const block = PB.createBlock('text', { content: '**forte** e [x](javascript:alert(1)) e [y](https://a.com)' });
  const html = R.renderPage({ blocks: [block] });
  assert.ok(html.includes('<strong>forte</strong>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="https://a.com"'));
});

test('cores inválidas são ignoradas (sem injeção de CSS)', () => {
  const block = PB.createBlock('hero', { bgColor: 'red;}</style><script>x</script>' });
  const html = R.renderPage({ blocks: [block], settings: { primaryColor: '}body{display:none' } });
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('display:none'));
});

test('extrai vídeos do YouTube e Vimeo', () => {
  assert.strictEqual(R.videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(R.videoEmbed('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(R.videoEmbed('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456');
  assert.strictEqual(R.videoEmbed('https://exemplo.com'), null);
});

test('modo editor adiciona identificadores de bloco', () => {
  const block = PB.createBlock('text');
  assert.ok(R.renderPage({ blocks: [block] }, { editor: true }).includes('data-block-id="' + block.id + '"'));
  assert.ok(!R.renderPage({ blocks: [block] }).includes('data-block-id'));
});
