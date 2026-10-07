'use strict';

const crypto = require('crypto');
const PB = require('../public/js/blocks.js');
const sitedata = require('./sitedata.js');

const MAX_BLOCKS = 200;
const MAX_STRING = 10000;
const RESERVED_SLUGS = new Set(['api', 'editor', 'css', 'js', 'p', 'm', 'admin', 'login', 'app']);

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
    const other = store.find('pages', (p) => p.slug === candidate);
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

/**
 * Cria uma página. input pode trazer:
 *  - template: modelo de página em branco (blank, landing, bio, portfolio)
 *  - site: conteúdo já gerado { kind, settings, blocks } ou { kind: 'html', templateId }
 *  - siteData, leadId
 */
function createPage(store, userId, input) {
  input = input || {};
  const title = String(input.title || '').trim().slice(0, 120) || 'Nova página';
  const now = new Date().toISOString();
  const page = {
    id: crypto.randomUUID(),
    userId,
    title,
    slug: uniqueSlug(store, input.slug || title),
    published: false,
    kind: 'blocks',
    settings: Object.assign({}, PB.DEFAULT_SETTINGS),
    blocks: [],
    leadId: input.leadId || null,
    siteData: input.siteData ? sitedata.clean(input.siteData) : null,
    templateId: null,
    vercel: null,
    createdAt: now,
    updatedAt: now,
  };
  if (input.site) {
    page.kind = input.site.kind === 'html' ? 'html' : 'blocks';
    if (page.kind === 'html') page.templateId = input.site.templateId;
    else {
      page.settings = Object.assign({}, PB.DEFAULT_SETTINGS, cleanSettings(input.site.settings));
      page.blocks = cleanBlocks(input.site.blocks || []);
    }
  } else {
    const template = PB.TEMPLATES[input.template] || PB.TEMPLATES.blank;
    const built = template.build();
    page.settings = Object.assign({}, PB.DEFAULT_SETTINGS, built.settings);
    page.blocks = built.blocks;
  }
  return store.insert('pages', page);
}

function updatePage(store, id, input) {
  const page = store.get('pages', id);
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
    const other = store.find('pages', (p) => p.slug === slug);
    if (other && other.id !== id) throw new ValidationError('Já existe uma página com o endereço "' + slug + '"');
    next.slug = slug;
  }
  if (input.published !== undefined) next.published = Boolean(input.published);
  if (input.settings !== undefined) next.settings = Object.assign({}, PB.DEFAULT_SETTINGS, cleanSettings(input.settings));
  if (input.blocks !== undefined) next.blocks = cleanBlocks(input.blocks);
  if (input.siteData !== undefined) next.siteData = sitedata.clean(input.siteData);
  if (input.templateId !== undefined && page.kind === 'html') next.templateId = String(input.templateId);
  next.updatedAt = new Date().toISOString();
  return store.update('pages', id, next);
}

function duplicatePage(store, id) {
  const page = store.get('pages', id);
  if (!page) return null;
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(page));
  copy.id = crypto.randomUUID();
  copy.title = page.title + ' (cópia)';
  copy.slug = uniqueSlug(store, page.slug + '-copia');
  copy.published = false;
  copy.vercel = null;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.blocks = (copy.blocks || []).map((b) => Object.assign(b, { id: PB.uid() }));
  return store.insert('pages', copy);
}

module.exports = { ValidationError, slugify, uniqueSlug, cleanBlocks, createPage, updatePage, duplicatePage };
