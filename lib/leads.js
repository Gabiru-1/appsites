'use strict';

const crypto = require('crypto');
const google = require('./google.js');
const { extFor } = require('./media.js');

const STATUSES = ['novo', 'contatado', 'negociando', 'vendido', 'perdido'];
const STATUS_LABELS = { novo: 'Novo', contatado: 'Contatado', negociando: 'Negociando', vendido: 'Vendido', perdido: 'Perdido' };

class LeadError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 400;
  }
}

function money(v) {
  const n = Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
  return isFinite(n) && n >= 0 ? Math.min(n, 10000000) : 0;
}

/** Salva um estabelecimento como lead (busca os detalhes completos no Google). */
async function createFromPlace(store, user, apiKey, placeId) {
  const existing = store.find('leads', (l) => l.userId === user.id && l.placeId === placeId);
  if (existing) return { lead: existing, created: false };
  const place = await google.details(apiKey, placeId);
  const now = new Date().toISOString();
  const lead = {
    id: crypto.randomUUID(),
    userId: user.id,
    placeId,
    status: 'novo',
    data: place,
    photos: [],
    notes: '',
    valor: 0,
    mensalidade: 0,
    vendidoEm: null,
    history: [{ at: now, status: 'novo' }],
    createdAt: now,
    updatedAt: now,
  };
  store.insert('leads', lead);
  return { lead, created: true };
}

/** Cria um lead manual (sem Google). */
function createManual(store, user, input) {
  const nome = String(input.nome || '').trim().slice(0, 120);
  if (!nome) throw new LeadError('Informe o nome do negócio');
  const now = new Date().toISOString();
  const lead = {
    id: crypto.randomUUID(),
    userId: user.id,
    placeId: null,
    status: 'novo',
    data: {
      nome,
      categoria: String(input.categoria || '').slice(0, 120),
      cidade: String(input.cidade || '').slice(0, 120),
      telefone: String(input.telefone || '').slice(0, 40),
      endereco: String(input.endereco || '').slice(0, 300),
      website: '', mapsUrl: '', avaliacao: null, totalAvaliacoes: 0, horarios: [], avaliacoes: [], fotosGoogle: [],
    },
    photos: [],
    notes: '',
    valor: 0,
    mensalidade: 0,
    vendidoEm: null,
    history: [{ at: now, status: 'novo' }],
    createdAt: now,
    updatedAt: now,
  };
  return store.insert('leads', lead);
}

async function refresh(store, lead, apiKey) {
  if (!lead.placeId) throw new LeadError('Este lead não veio do Google');
  lead.data = await google.details(apiKey, lead.placeId);
  lead.updatedAt = new Date().toISOString();
  return store.update('leads', lead.id, lead);
}

/** Baixa as fotos do Google para o servidor (até "max"). */
async function importPhotos(store, media, lead, apiKey, max) {
  const refs = (lead.data.fotosGoogle || []).slice(0, Math.min(20, Math.max(1, Number(max) || 10)));
  if (!refs.length) throw new LeadError('Este local não tem fotos no Google');
  const have = new Set((lead.photos || []).map((p) => p.ref));
  let n = (lead.photos || []).reduce((m, p) => Math.max(m, Number((p.name.match(/\d+/) || [0])[0])), 0);
  const errors = [];
  for (const ref of refs) {
    if (have.has(ref.name)) continue;
    try {
      const { buffer, contentType } = await google.photo(apiKey, ref.name, 1600);
      const name = 'foto-' + ++n + '.' + extFor(contentType);
      const url = await media.save(lead.id, name, buffer, contentType);
      lead.photos.push({ name, url, ref: ref.name, autor: ref.autor || '', tamanho: buffer.length });
    } catch (e) {
      errors.push(e.message);
    }
  }
  lead.updatedAt = new Date().toISOString();
  store.update('leads', lead.id, lead);
  return { photos: lead.photos, errors };
}

function update(store, lead, input) {
  const next = Object.assign({}, lead);
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new LeadError('Status inválido');
    if (input.status !== lead.status) {
      next.history = (lead.history || []).concat([{ at: new Date().toISOString(), status: input.status }]);
      if (input.status === 'vendido' && !lead.vendidoEm && input.vendidoEm === undefined) {
        next.vendidoEm = new Date().toISOString().slice(0, 10);
      }
    }
    next.status = input.status;
  }
  if (input.notes !== undefined) next.notes = String(input.notes).slice(0, 10000);
  if (input.valor !== undefined) next.valor = money(input.valor);
  if (input.mensalidade !== undefined) next.mensalidade = money(input.mensalidade);
  if (input.vendidoEm !== undefined) {
    next.vendidoEm = /^\d{4}-\d{2}-\d{2}$/.test(String(input.vendidoEm)) ? input.vendidoEm : null;
  }
  if (input.data && typeof input.data === 'object') {
    // Permite corrigir telefone, nome, etc.
    for (const k of ['nome', 'categoria', 'cidade', 'telefone', 'endereco', 'website']) {
      if (typeof input.data[k] === 'string') next.data = Object.assign({}, next.data, { [k]: input.data[k].slice(0, 300) });
    }
  }
  next.updatedAt = new Date().toISOString();
  return store.update('leads', lead.id, next);
}

function summary(store, lead) {
  const site = store.find('pages', (p) => p.leadId === lead.id);
  return {
    id: lead.id,
    placeId: lead.placeId,
    status: lead.status,
    nome: lead.data.nome,
    categoria: lead.data.categoria,
    cidade: lead.data.cidade,
    telefone: lead.data.telefone,
    website: lead.data.website,
    avaliacao: lead.data.avaliacao,
    totalAvaliacoes: lead.data.totalAvaliacoes,
    fotos: (lead.photos || []).length,
    capa: (lead.photos || [])[0] ? lead.photos[0].url : '',
    valor: lead.valor,
    mensalidade: lead.mensalidade,
    vendidoEm: lead.vendidoEm,
    siteId: site ? site.id : null,
    siteSlug: site ? site.slug : null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

/** Números do painel de vendas. */
function dashboard(store, userId, now) {
  now = now || new Date();
  const leads = store.filter('leads', (l) => l.userId === userId);
  const pages = store.filter('pages', (p) => p.userId === userId);
  const pageIds = new Set(pages.map((p) => p.id));
  const sold = leads.filter((l) => l.status === 'vendido');
  const monthKey = (d) => String(d).slice(0, 7);
  const thisMonth = now.toISOString().slice(0, 7);

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ mes: d.toISOString().slice(0, 7), vendas: 0, valor: 0 });
  }
  for (const l of sold) {
    const m = months.find((x) => x.mes === monthKey(l.vendidoEm || l.updatedAt));
    if (m) {
      m.vendas++;
      m.valor += l.valor || 0;
    }
  }

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  const worked = leads.length - byStatus.novo;
  const total = sold.reduce((n, l) => n + (l.valor || 0), 0);
  const submissions = store.filter('submissions', (s) => pageIds.has(s.pageId));

  return {
    faturamentoTotal: total,
    faturamentoMes: sold.filter((l) => monthKey(l.vendidoEm || l.updatedAt) === thisMonth).reduce((n, l) => n + (l.valor || 0), 0),
    vendasMes: sold.filter((l) => monthKey(l.vendidoEm || l.updatedAt) === thisMonth).length,
    recorrenciaMensal: sold.reduce((n, l) => n + (l.mensalidade || 0), 0),
    ticketMedio: sold.length ? total / sold.length : 0,
    vendas: sold.length,
    leads: leads.length,
    conversao: worked ? sold.length / worked : 0,
    porStatus: byStatus,
    meses: months,
    sites: pages.length,
    sitesPublicados: pages.filter((p) => p.published).length,
    sitesVercel: pages.filter((p) => p.vercel && p.vercel.url).length,
    mensagens: submissions.length,
    ultimasVendas: sold
      .slice()
      .sort((a, b) => String(b.vendidoEm || '').localeCompare(String(a.vendidoEm || '')))
      .slice(0, 5)
      .map((l) => ({ id: l.id, nome: l.data.nome, valor: l.valor, mensalidade: l.mensalidade, vendidoEm: l.vendidoEm })),
  };
}

module.exports = {
  STATUSES, STATUS_LABELS, LeadError, createFromPlace, createManual, refresh, importPhotos, update, summary, dashboard,
};
