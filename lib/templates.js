'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PB = require('../public/js/blocks.js');

const BUILTIN_DIR = path.join(__dirname, '..', 'templates');

class TemplateError extends Error {}

// ---------------------------------------------------------------------------
// Mini "mustache": {{var}} (escapado), {{{var}}} (sem escape),
// {{#lista}}...{{/lista}} (repete/condicional), {{^var}}...{{/var}} (se vazio)
// ---------------------------------------------------------------------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);

function parse(tpl) {
  const re = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([#^/!]?)\s*([\w.]+)\s*\}\}/g;
  const root = { children: [] };
  const stack = [root];
  let last = 0;
  let m;
  while ((m = re.exec(tpl))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ t: 'text', v: tpl.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) {
      top.children.push({ t: 'var', name: m[1], raw: true });
    } else if (m[2] === '#' || m[2] === '^') {
      const node = { t: 'section', name: m[3], inverted: m[2] === '^', children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (m[2] === '/') {
      if (stack.length < 2 || stack[stack.length - 1].name !== m[3]) {
        throw new TemplateError('Seção {{/' + m[3] + '}} fechada sem abrir');
      }
      stack.pop();
    } else if (m[2] === '!') {
      // comentário
    } else {
      top.children.push({ t: 'var', name: m[3], raw: false });
    }
  }
  if (stack.length > 1) throw new TemplateError('Seção {{#' + stack[stack.length - 1].name + '}} não foi fechada');
  if (last < tpl.length) root.children.push({ t: 'text', v: tpl.slice(last) });
  return root;
}

function lookup(ctxStack, name) {
  if (name === '.') return ctxStack[ctxStack.length - 1];
  for (let i = ctxStack.length - 1; i >= 0; i--) {
    const ctx = ctxStack[i];
    if (ctx && typeof ctx === 'object') {
      const first = name.split('.')[0];
      if (first in ctx) return name.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    }
  }
  return undefined;
}

function renderNodes(nodes, ctxStack) {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.v;
    else if (n.t === 'var') {
      const v = lookup(ctxStack, n.name);
      out += n.raw ? String(v == null ? '' : v) : esc(v);
    } else {
      const v = lookup(ctxStack, n.name);
      const empty = v == null || v === false || v === '' || v === 0 || (Array.isArray(v) && !v.length);
      if (n.inverted) {
        if (empty) out += renderNodes(n.children, ctxStack);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => {
          const scope = item && typeof item === 'object' ? Object.assign({ indice: i + 1 }, item) : { '.': item, indice: i + 1 };
          out += renderNodes(n.children, ctxStack.concat([scope, item]));
        });
      } else if (!empty) {
        out += renderNodes(n.children, typeof v === 'object' ? ctxStack.concat([v]) : ctxStack);
      }
    }
  }
  return out;
}

function renderMustache(tpl, view) {
  return renderNodes(parse(tpl).children, [view]);
}

// ---------------------------------------------------------------------------
// Variáveis disponíveis nos modelos HTML
// ---------------------------------------------------------------------------

function stars(n) {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★★★★★'.slice(0, k) + '☆☆☆☆☆'.slice(0, 5 - k);
}

function viewFor(data) {
  const fotos = data.fotos || [];
  const view = {
    nome: data.nome,
    categoria: data.categoria,
    cidade: data.cidade,
    descricao: data.descricao,
    titulo: data.titulo || data.nome,
    subtitulo: data.subtitulo,
    sobre: data.sobre,
    sobre_html: esc(data.sobre).split(/\n\s*\n/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join(''),
    cta: data.cta || 'Fale conosco',
    telefone: data.telefone,
    telefone_link: 'tel:' + String(data.telefone || '').replace(/[^\d+]/g, ''),
    whatsapp: data.whatsapp,
    whatsapp_link: data.whatsapp ? 'https://wa.me/' + data.whatsapp : '',
    email: data.email,
    instagram: data.instagram,
    endereco: data.endereco,
    maps_link: data.mapsUrl,
    maps_embed: data.mapsEmbed,
    avaliacao: data.avaliacao,
    total_avaliacoes: data.totalAvaliacoes,
    cor_principal: data.corPrincipal || '#2563eb',
    ano: new Date().getFullYear(),
    horarios: data.horarios || [],
    avaliacoes: (data.avaliacoes || []).map((r) => Object.assign({ estrelas: stars(r.nota) }, r)),
    servicos: data.servicos || [],
    fotos: fotos.map((url, i) => ({ url, numero: i + 1 })),
    foto_principal: fotos[0] || '',
    link_contato: data.whatsapp ? 'https://wa.me/' + data.whatsapp : (data.telefone ? 'tel:' + String(data.telefone).replace(/[^\d+]/g, '') : '#contato'),
  };
  for (let i = 0; i < 20; i++) view['foto_' + (i + 1)] = fotos[i] || '';
  return view;
}

const VARIABLES = [
  ['nome', 'Nome do negócio'], ['categoria', 'Segmento (ex.: Pizzaria)'], ['cidade', 'Cidade - UF'],
  ['titulo', 'Título principal'], ['subtitulo', 'Subtítulo'], ['sobre', 'Texto "sobre" (texto puro)'],
  ['{sobre_html}', 'Texto "sobre" em parágrafos HTML (use com 3 chaves)'], ['cta', 'Texto do botão principal'],
  ['telefone', 'Telefone formatado'], ['telefone_link', 'Link tel:'], ['whatsapp', 'Número do WhatsApp'],
  ['whatsapp_link', 'Link https://wa.me/...'], ['link_contato', 'WhatsApp, ou telefone, ou #contato'],
  ['email', 'E-mail'], ['instagram', 'Link do Instagram'], ['endereco', 'Endereço completo'],
  ['maps_link', 'Link do Google Maps'], ['maps_embed', 'URL para <iframe> do mapa'],
  ['avaliacao', 'Nota no Google (ex.: 4,8)'], ['total_avaliacoes', 'Quantidade de avaliações'],
  ['cor_principal', 'Cor principal (#hex)'], ['ano', 'Ano atual'], ['foto_principal', 'Primeira foto'],
  ['foto_1 … foto_20', 'Fotos individuais'],
  ['#fotos … /fotos', 'Repete para cada foto: {{url}}, {{numero}}'],
  ['#avaliacoes … /avaliacoes', 'Repete: {{autor}}, {{nota}}, {{estrelas}}, {{texto}}'],
  ['#servicos … /servicos', 'Repete: {{icone}}, {{titulo}}, {{texto}}'],
  ['#horarios … /horarios', 'Repete: {{dia}}, {{horas}}'],
  ['#campo … /campo', 'Mostra o trecho só se o campo estiver preenchido'],
  ['^campo … /campo', 'Mostra o trecho só se o campo estiver vazio'],
];

// ---------------------------------------------------------------------------
// Modelos de blocos (editáveis no editor visual)
// ---------------------------------------------------------------------------

function contactUrl(d) {
  if (d.whatsapp) return 'https://wa.me/' + d.whatsapp;
  if (d.telefone) return 'tel:' + String(d.telefone).replace(/[^\d+]/g, '');
  return '#contato';
}

function sections(d, style) {
  const B = PB.createBlock;
  const fotos = d.fotos || [];
  const out = {};
  out.hero = B('hero', {
    title: d.titulo || d.nome,
    subtitle: d.subtitulo,
    buttonText: d.cta || 'Fale conosco',
    buttonUrl: contactUrl(d),
    bgImage: style.heroImage === false ? '' : fotos[0] || '',
    bgColor: style.heroBg || '',
    textColor: style.heroText || '#ffffff',
    align: style.heroAlign || 'center',
    height: style.heroHeight || 'large',
  });
  out.about = [
    B('heading', { text: style.aboutTitle || 'Sobre nós', align: style.align || 'center', anchor: 'sobre' }),
    B('text', { content: d.sobre, align: style.align || 'center', size: 'large' }),
  ];
  if (fotos[1] && style.aboutImage) out.about.push(B('image', { src: fotos[1], alt: d.nome, width: 80 }));
  out.services = d.servicos && d.servicos.length
    ? [B('features', {
      title: style.servicesTitle || 'O que oferecemos',
      columns: String(Math.min(4, Math.max(2, d.servicos.length === 4 ? 4 : d.servicos.length >= 3 ? 3 : 2))),
      items: d.servicos.map((s) => ({ icon: s.icone, title: s.titulo, text: s.texto })),
    })]
    : [];
  out.gallery = fotos.length > 1
    ? [B('heading', { text: 'Galeria', align: 'center' }), B('gallery', {
      columns: fotos.length >= 6 ? '3' : '2',
      images: fotos.slice(style.heroImage === false ? 0 : 1, 10).map((url, i) => ({ src: url, alt: d.nome + ' - foto ' + (i + 1) })),
    })]
    : [];
  out.reviews = d.avaliacoes && d.avaliacoes.length
    ? [B('reviews', {
      title: 'O que nossos clientes dizem',
      rating: d.avaliacao,
      total: d.totalAvaliacoes ? String(d.totalAvaliacoes) : '',
      link: d.mapsUrl,
      items: d.avaliacoes.slice(0, 6).map((r) => ({ author: r.autor, stars: r.nota, text: r.texto })),
    })]
    : [];
  out.hours = d.horarios && d.horarios.length
    ? [B('hours', { items: d.horarios.map((h) => ({ day: h.dia, time: h.horas })) })]
    : [];
  out.map = d.endereco ? [B('map', { address: d.nome + ', ' + d.endereco })] : [];
  out.contact = [B('contactInfo', {
    phone: d.telefone, whatsapp: d.whatsapp, email: d.email, address: d.endereco, instagram: d.instagram,
  })];
  out.footer = B('footer', {
    text: '© ' + new Date().getFullYear() + ' ' + d.nome + (d.cidade ? ' • ' + d.cidade : '') + '. Todos os direitos reservados.',
    bgColor: style.footerBg || '#111827',
    textColor: style.footerText || '#e5e7eb',
  });
  return out;
}

const BLOCK_MODELS = {
  classico: {
    name: 'Clássico',
    description: 'Claro e confiável. Serve para qualquer segmento.',
    color: '#2563eb',
    build(d) {
      const s = sections(d, {});
      return {
        settings: { primaryColor: d.corPrincipal || '#2563eb', font: 'Inter', whatsapp: d.whatsapp },
        blocks: [s.hero, ...s.about, ...s.services, ...s.gallery, ...s.reviews, ...s.hours, ...s.map, ...s.contact, s.footer],
      };
    },
  },
  escuro: {
    name: 'Moderno escuro',
    description: 'Fundo escuro e elegante: barbearias, academias, bares.',
    color: '#f59e0b',
    build(d) {
      const s = sections(d, { footerBg: '#020617', heroAlign: 'left' });
      return {
        settings: { primaryColor: d.corPrincipal || '#f59e0b', bgColor: '#0b1120', textColor: '#e5e7eb', font: 'Montserrat', whatsapp: d.whatsapp },
        blocks: [s.hero, ...s.services, ...s.about, ...s.gallery, ...s.reviews, ...s.hours, ...s.map, ...s.contact, s.footer],
      };
    },
  },
  minimalista: {
    name: 'Minimalista',
    description: 'Muito espaço em branco e tipografia com serifa: clínicas, escritórios.',
    color: '#111827',
    build(d) {
      const s = sections(d, { heroImage: false, heroBg: '#f8fafc', heroText: '#0f172a', heroHeight: 'medium', aboutImage: true, footerBg: '#f8fafc', footerText: '#475569' });
      return {
        settings: { primaryColor: d.corPrincipal || '#0f172a', font: 'Playfair Display', maxWidth: '800', whatsapp: d.whatsapp },
        blocks: [s.hero, ...s.about, ...s.services, ...s.reviews, ...s.gallery, ...s.hours, ...s.contact, ...s.map, s.footer],
      };
    },
  },
  vibrante: {
    name: 'Vibrante',
    description: 'Cores fortes e chamativas: restaurantes, lanchonetes, pet shops.',
    color: '#ea580c',
    build(d) {
      const s = sections(d, { servicesTitle: 'Nossos destaques' });
      return {
        settings: { primaryColor: d.corPrincipal || '#ea580c', bgColor: '#fffbf5', font: 'Poppins', whatsapp: d.whatsapp },
        blocks: [s.hero, ...s.reviews, ...s.services, ...s.gallery, ...s.about, ...s.hours, ...s.map, ...s.contact, s.footer],
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Modelos HTML (enviados pelo administrador ou na pasta templates/)
// ---------------------------------------------------------------------------

function readBuiltinHtml() {
  if (!fs.existsSync(BUILTIN_DIR)) return [];
  return fs.readdirSync(BUILTIN_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const html = fs.readFileSync(path.join(BUILTIN_DIR, f), 'utf8');
      const meta = html.match(/<!--\s*modelo:\s*(.+?)\s*\|\s*(.+?)\s*-->/);
      return {
        id: 'html:' + f.replace(/\.html$/, ''),
        kind: 'html',
        name: meta ? meta[1] : f.replace(/\.html$/, ''),
        description: meta ? meta[2] : '',
        builtin: true,
        html,
      };
    });
}

let builtinCache = null;
function builtinHtml() {
  if (!builtinCache) builtinCache = readBuiltinHtml();
  return builtinCache;
}

function listModels(store) {
  const blocks = Object.entries(BLOCK_MODELS).map(([id, m]) => ({
    id: 'blocks:' + id, kind: 'blocks', name: m.name, description: m.description, color: m.color, builtin: true,
  }));
  const html = builtinHtml().concat(store.all('templates').map((t) => ({
    id: 'html:' + t.id, kind: 'html', name: t.name, description: t.description, builtin: false, createdAt: t.createdAt,
  })));
  return blocks.concat(html.map((t) => ({
    id: t.id, kind: 'html', name: t.name, description: t.description, builtin: t.builtin, createdAt: t.createdAt,
  })));
}

function getHtmlTemplate(store, id) {
  const key = String(id || '').replace(/^html:/, '');
  const builtin = builtinHtml().find((t) => t.id === 'html:' + key);
  if (builtin) return builtin;
  const t = store.get('templates', key);
  return t ? { id: 'html:' + t.id, kind: 'html', name: t.name, description: t.description, html: t.html } : null;
}

function validateHtml(html) {
  const s = String(html || '');
  if (s.length < 20) throw new TemplateError('O arquivo HTML está vazio');
  if (s.length > 1024 * 1024) throw new TemplateError('O modelo deve ter no máximo 1 MB');
  parse(s); // lança erro se as seções estiverem mal formadas
  return s;
}

function saveTemplate(store, input) {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new TemplateError('Dê um nome ao modelo');
  const t = {
    id: crypto.randomUUID(),
    name,
    description: String(input.description || '').trim().slice(0, 200),
    html: validateHtml(input.html),
    createdAt: new Date().toISOString(),
  };
  return store.insert('templates', t);
}

function updateTemplate(store, id, input) {
  const t = store.get('templates', id);
  if (!t) return null;
  if (input.name !== undefined) t.name = String(input.name).trim().slice(0, 80) || t.name;
  if (input.description !== undefined) t.description = String(input.description).trim().slice(0, 200);
  if (input.html !== undefined) t.html = validateHtml(input.html);
  return store.update('templates', id, t);
}

function renderHtmlSite(store, templateId, data) {
  const t = getHtmlTemplate(store, templateId);
  if (!t) throw new TemplateError('Modelo não encontrado');
  return renderMustache(t.html, viewFor(data));
}

/** Cria o conteúdo inicial de um site a partir de um modelo e dos dados. */
function buildSite(store, modelId, data) {
  const id = String(modelId || '');
  if (id.startsWith('blocks:')) {
    const m = BLOCK_MODELS[id.slice(7)];
    if (!m) throw new TemplateError('Modelo não encontrado');
    const built = m.build(data);
    return { kind: 'blocks', settings: Object.assign({}, PB.DEFAULT_SETTINGS, built.settings), blocks: built.blocks };
  }
  if (!getHtmlTemplate(store, id)) throw new TemplateError('Modelo não encontrado');
  return { kind: 'html', templateId: id };
}

module.exports = {
  TemplateError, renderMustache, viewFor, VARIABLES, BLOCK_MODELS, listModels, getHtmlTemplate,
  saveTemplate, updateTemplate, renderHtmlSite, buildSite,
};
