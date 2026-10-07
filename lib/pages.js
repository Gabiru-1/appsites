'use strict';

const crypto = require('crypto');
const PB = require('../public/js/blocks.js');

const MAX_BLOCKS = 200;
const MAX_STRING = 10000;
const RESERVED_SLUGS = new Set(['api', 'editor', 'css', 'js', 'p', 'admin']);

class ValidationError extends Error {}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function uniqueSlug(store, base, ignoreId) {
  let slug = slugify(base) || 'pagina';
  if (RESERVED_SLUGS.has(slug)) slug += '-1';
  let candidate = slug;
  let n = 2;
  while (true) {
    const other = store.getPageBySlug(candidate);
    if (!other || other.id === ignoreId) return candidate;
    candidate = slug + '-' + n++;
  }
}

// Mantém apenas valores primitivos/listas simples e limita o tamanho das strings.
function cleanValue(value, depth) {
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value) && depth < 2) return value.slice(0, 50).map((v) => cleanValue(v, depth + 1));
  if (value && typeof value === 'object' && depth < 2) {
    const out = {};
    for (const k of Object.keys(value).slice(0, 50)) out[k] = cleanValue(value[k], depth + 1);
    return out;
  }
  return '';
}

function cleanBlocks(blocks) {
  if (!Array.isArray(blocks)) throw new ValidationError('blocks deve ser uma lista');
  if (blocks.length > MAX_BLOCKS) throw new ValidationError('Limite de ' + MAX_BLOCKS + ' blocos por página');
  const seen = new Set();
  return blocks.map((b) => {
    if (!b || typeof b !== 'object' || !PB.BLOCKS[b.type]) {
      throw new ValidationError('Bloco inválido: ' + (b && b.type));
    }
    let id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) ? b.id : PB.uid();
    if (seen.has(id)) id = PB.uid();
    seen.add(id);
    const allowed = Object.keys(PB.BLOCKS[b.type].defaults);
    const data = {};
    const src = b.data && typeof b.data === 'object' ? b.data : {};
    for (const key of allowed) {
      if (key in src) data[key] = cleanValue(src[key], 0);
    }
    return { id, type: b.type, data };
  });
}

function cleanSettings(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const out = {};
  for (const key of Object.keys(PB.DEFAULT_SETTINGS)) {
    if (typeof src[key] === 'string') out[key] = src[key].slice(0, 500);
  }
  return out;
}

function createPage(store, input) {
  input = input || {};
  const title = String(input.title || '').trim().slice(0, 120) || 'Nova página';
  const template = PB.TEMPLATES[input.template] || PB.TEMPLATES.blank;
  const built = template.build();
  const now = new Date().toISOString();
  const page = {
    id: crypto.randomUUID(),
    title,
    slug: uniqueSlug(store, input.slug || title),
    published: false,
    settings: Object.assign({}, PB.DEFAULT_SETTINGS, built.settings),
    blocks: built.blocks,
    createdAt: now,
    updatedAt: now,
  };
  return store.insertPage(page);
}

function updatePage(store, id, input) {
  const page = store.getPage(id);
  if (!page) return null;
  input = input || {};
  const next = Object.assign({}, page);

  if (input.title !== undefined) {
    next.title = String(input.title).trim().slice(0, 120) || page.title;
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (!slug) throw new ValidationError('Endereço (slug) inválido');
    if (RESERVED_SLUGS.has(slug)) throw new ValidationError('Este endereço é reservado');
    const other = store.getPageBySlug(slug);
    if (other && other.id !== id) throw new ValidationError('Já existe uma página com o endereço "' + slug + '"');
    next.slug = slug;
  }
  if (input.published !== undefined) next.published = Boolean(input.published);
  if (input.settings !== undefined) next.settings = Object.assign({}, PB.DEFAULT_SETTINGS, cleanSettings(input.settings));
  if (input.blocks !== undefined) next.blocks = cleanBlocks(input.blocks);
  next.updatedAt = new Date().toISOString();
  return store.updatePage(id, next);
}

function duplicatePage(store, id) {
  const page = store.getPage(id);
  if (!page) return null;
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(page));
  copy.id = crypto.randomUUID();
  copy.title = page.title + ' (cópia)';
  copy.slug = uniqueSlug(store, page.slug + '-copia');
  copy.published = false;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.blocks = copy.blocks.map((b) => Object.assign(b, { id: PB.uid() }));
  return store.insertPage(copy);
}

module.exports = { ValidationError, slugify, uniqueSlug, cleanBlocks, createPage, updatePage, duplicatePage };
