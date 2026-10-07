'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store.js');
const { createApp } = require('../lib/app.js');

/** Sobe o servidor numa porta livre, com dados em pasta temporária. */
async function withServer(options, fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appsites-test-'));
  const store = new Store(null);
  const server = createApp(store, Object.assign({ dataDir }, options));
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await fn(base, store, dataDir);
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

/** Cliente HTTP simples que guarda o cookie de sessão. */
function client(base) {
  let cookie = '';
  async function req(method, p, body, extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    if (body !== undefined && typeof body !== 'string') headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await realFetch(base + p, {
      method,
      redirect: 'manual',
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  }
  async function json(method, p, body) {
    const res = await req(method, p, body);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  return { req, json };
}

async function signup(base, email, name) {
  const c = client(base);
  const r = await c.json('POST', '/api/auth/register', { name: name || 'Teste', email, password: 'senha-segura-123' });
  if (r.status !== 200) throw new Error('signup falhou: ' + JSON.stringify(r.data));
  return c;
}

// ---------- simulação das APIs externas ----------

const realFetch = globalThis.fetch;
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);

function fakePlace(id, extra) {
  return Object.assign({
    id,
    displayName: { text: 'Pizzaria ' + id },
    formattedAddress: 'Rua A, 10 - Centro, Curitiba - PR, 80000-000, Brasil',
    shortFormattedAddress: 'Rua A, 10 - Centro',
    rating: 4.7,
    userRatingCount: 120,
    nationalPhoneNumber: '(41) 99999-0000',
    internationalPhoneNumber: '+55 41 99999-0000',
    googleMapsUri: 'https://maps.google.com/?cid=' + id,
    primaryTypeDisplayName: { text: 'Pizzaria' },
    businessStatus: 'OPERATIONAL',
    location: { latitude: -25.4, longitude: -49.2 },
    photos: [
      { name: 'places/' + id + '/photos/f1', widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: 'Fulano' }] },
      { name: 'places/' + id + '/photos/f2', widthPx: 800, heightPx: 600 },
    ],
  }, extra || {});
}

const google = { calls: [], places: [] };

function installFakeApis() {
  google.places = [
    fakePlace('aaa111'),
    fakePlace('bbb222', { websiteUri: 'https://jatemsite.com' }),
    fakePlace('ccc333', { userRatingCount: 3 }),
    fakePlace('ddd444', { nationalPhoneNumber: undefined, internationalPhoneNumber: undefined }),
  ];
  const vercel = { calls: [] };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://places.googleapis.com/')) {
      google.calls.push({ url: u, init });
      const key = (init.headers || {})['X-Goog-Api-Key'];
      if (key !== 'google-key-ok') {
        return new Response(JSON.stringify({ error: { message: 'API key not valid.' } }), { status: 400 });
      }
      if (u.endsWith('/places:searchText')) {
        return Response.json({ places: google.places });
      }
      if (u.includes('/media?')) {
        return new Response(FAKE_JPEG, { headers: { 'content-type': 'image/jpeg' } });
      }
      const id = u.match(/\/places\/([\w-]+)\?/)[1];
      const p = google.places.find((x) => x.id === id);
      return Response.json(Object.assign({}, p, {
        addressComponents: [
          { longText: 'Curitiba', shortText: 'Curitiba', types: ['administrative_area_level_2'] },
          { longText: 'Paraná', shortText: 'PR', types: ['administrative_area_level_1'] },
        ],
        regularOpeningHours: { weekdayDescriptions: ['segunda-feira: 18:00 – 23:00', 'terça-feira: Fechado'] },
        reviews: [
          { rating: 5, text: { text: 'Pizza maravilhosa!' }, authorAttribution: { displayName: 'Ana' }, relativePublishTimeDescription: 'há 1 mês' },
          { rating: 2, text: { text: 'Demorou.' }, authorAttribution: { displayName: 'Beto' } },
        ],
        editorialSummary: { text: 'Pizzas no forno a lenha.' },
      }));
    }
    if (u.startsWith('https://api.vercel.com/')) {
      vercel.calls.push({ url: u, init, body: JSON.parse(init.body) });
      if (init.headers.Authorization !== 'Bearer vercel-ok') {
        return new Response(JSON.stringify({ error: { message: 'Not authorized' } }), { status: 403 });
      }
      const body = JSON.parse(init.body);
      return Response.json({ id: 'dpl_1', url: body.name + '-abc.vercel.app', alias: [body.name + '.vercel.app'], readyState: 'QUEUED' });
    }
    return realFetch(url, init);
  };
  return { google, vercel, restore: () => { globalThis.fetch = realFetch; } };
}

module.exports = { withServer, client, signup, installFakeApis, FAKE_JPEG };
