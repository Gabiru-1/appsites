'use strict';

/**
 * Integração com a Google Places API (New).
 * Documentação: https://developers.google.com/maps/documentation/places/web-service/op-overview
 * A chave é a do próprio usuário (Configurações), e as chamadas saem sempre do servidor.
 */

const BASE = 'https://places.googleapis.com/v1';

const SEARCH_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress',
  'places.rating', 'places.userRatingCount', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.primaryTypeDisplayName', 'places.businessStatus',
  'places.location', 'places.photos', 'nextPageToken',
].join(',');

const DETAIL_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'addressComponents', 'location',
  'rating', 'userRatingCount', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'googleMapsUri', 'primaryType', 'primaryTypeDisplayName', 'businessStatus', 'regularOpeningHours',
  'editorialSummary', 'reviews', 'photos', 'priceLevel',
].join(',');

class GoogleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 502;
  }
}

async function call(url, apiKey, init) {
  if (!apiKey) throw new GoogleError('Configure sua chave da API do Google em Configurações', 400);
  let res;
  try {
    res = await fetch(url, Object.assign({}, init, {
      headers: Object.assign({ 'X-Goog-Api-Key': apiKey, 'Content-Type': 'application/json' }, init.headers || {}),
    }));
  } catch (e) {
    throw new GoogleError('Não foi possível conectar ao Google: ' + e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || 'Erro ' + res.status;
    throw new GoogleError('Google: ' + msg, res.status === 400 || res.status === 403 ? 400 : 502);
  }
  return data;
}

function cityFrom(place) {
  const comps = place.addressComponents || [];
  const pick = (type) => comps.find((c) => (c.types || []).includes(type));
  const c = pick('administrative_area_level_2') || pick('locality');
  const uf = pick('administrative_area_level_1');
  if (c) return c.longText + (uf ? ' - ' + (uf.shortText || uf.longText) : '');
  // Sem componentes (resultado da busca): tenta extrair do endereço "…, Cidade - UF, CEP, País"
  const m = String(place.formattedAddress || '').match(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\b/);
  return m ? m[1] + ' - ' + m[2] : '';
}

/** Converte o formato do Google para o formato usado no sistema. */
function normalizePlace(p) {
  return {
    placeId: p.id,
    nome: (p.displayName && p.displayName.text) || '',
    categoria: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
    tipo: p.primaryType || '',
    endereco: p.formattedAddress || '',
    enderecoCurto: p.shortFormattedAddress || '',
    cidade: cityFrom(p),
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    telefone: p.nationalPhoneNumber || '',
    telefoneInternacional: p.internationalPhoneNumber || '',
    website: p.websiteUri || '',
    mapsUrl: p.googleMapsUri || '',
    avaliacao: typeof p.rating === 'number' ? p.rating : null,
    totalAvaliacoes: p.userRatingCount || 0,
    status: p.businessStatus || '',
    faixaPreco: p.priceLevel || '',
    descricao: (p.editorialSummary && p.editorialSummary.text) || '',
    horarios: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || [],
    avaliacoes: (p.reviews || []).map((r) => ({
      autor: (r.authorAttribution && r.authorAttribution.displayName) || 'Cliente',
      foto: (r.authorAttribution && r.authorAttribution.photoUri) || '',
      nota: r.rating || 0,
      texto: (r.text && r.text.text) || (r.originalText && r.originalText.text) || '',
      quando: r.relativePublishTimeDescription || '',
    })).filter((r) => r.texto),
    fotosGoogle: (p.photos || []).map((ph) => ({
      name: ph.name,
      largura: ph.widthPx,
      altura: ph.heightPx,
      autor: ((ph.authorAttributions || [])[0] || {}).displayName || '',
    })),
  };
}

function matchesFilters(place, f) {
  if (f.minReviews && place.totalAvaliacoes < f.minReviews) return false;
  if (f.maxReviews && place.totalAvaliacoes > f.maxReviews) return false;
  if (f.website === 'without' && place.website) return false;
  if (f.website === 'with' && !place.website) return false;
  if (f.phone === 'with' && !place.telefone) return false;
  if (f.onlyOperational && place.status && place.status !== 'OPERATIONAL') return false;
  return true;
}

/**
 * Busca estabelecimentos. Ex.: { niche: 'pizzaria', location: 'Curitiba PR', minRating: 4 }
 * Retorna até 20 resultados por página do Google (máx. 3 páginas = 60).
 */
async function search(apiKey, input) {
  const niche = String(input.niche || '').trim();
  const location = String(input.location || '').trim();
  if (!niche) throw new GoogleError('Informe o nicho (ex.: pizzaria, dentista, academia)', 400);
  const filters = {
    minReviews: Math.max(0, Number(input.minReviews) || 0),
    maxReviews: Math.max(0, Number(input.maxReviews) || 0),
    website: ['with', 'without'].includes(input.website) ? input.website : 'any',
    phone: input.phone === 'with' ? 'with' : 'any',
    onlyOperational: input.onlyOperational !== false,
  };
  const pages = Math.min(3, Math.max(1, Number(input.pages) || 1));
  const body = {
    textQuery: location ? niche + ' em ' + location : niche,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    pageSize: 20,
  };
  const minRating = Number(input.minRating);
  if (minRating > 0) body.minRating = Math.min(5, Math.round(minRating * 2) / 2);
  if (input.openNow) body.openNow = true;

  const results = [];
  let token = input.pageToken || '';
  let fetched = 0;
  let total = 0;
  for (let i = 0; i < pages; i++) {
    const payload = Object.assign({}, body, token ? { pageToken: token } : {});
    const data = await call(BASE + '/places:searchText', apiKey, {
      method: 'POST',
      headers: { 'X-Goog-FieldMask': SEARCH_FIELDS },
      body: JSON.stringify(payload),
    });
    const places = (data.places || []).map(normalizePlace);
    total += places.length;
    for (const p of places) if (matchesFilters(p, filters)) results.push(p);
    fetched++;
    token = data.nextPageToken || '';
    if (!token) break;
  }
  return { query: body.textQuery, results, totalFound: total, pagesFetched: fetched, nextPageToken: token };
}

async function details(apiKey, placeId) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(placeId || ''))) throw new GoogleError('ID de local inválido', 400);
  const data = await call(BASE + '/places/' + placeId + '?languageCode=pt-BR&regionCode=BR', apiKey, {
    method: 'GET',
    headers: { 'X-Goog-FieldMask': DETAIL_FIELDS },
  });
  return normalizePlace(data);
}

/** Baixa uma foto do Google e devolve { buffer, contentType }. */
async function photo(apiKey, photoName, maxWidth) {
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(String(photoName || ''))) {
    throw new GoogleError('Foto inválida', 400);
  }
  const url = BASE + '/' + photoName + '/media?maxWidthPx=' + (maxWidth || 1600);
  let res;
  try {
    res = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKey } });
  } catch (e) {
    throw new GoogleError('Não foi possível baixar a foto: ' + e.message);
  }
  if (!res.ok) throw new GoogleError('Google: erro ' + res.status + ' ao baixar foto');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

module.exports = { search, details, photo, normalizePlace, GoogleError };
