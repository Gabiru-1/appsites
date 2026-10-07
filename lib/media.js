'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Armazenamento das fotos importadas do Google.
 *  - Disco (servidor próprio): <dataDir>/media/<leadId>/foto-N.jpg, servidas em /m/<leadId>/foto-N.jpg
 *  - Vercel Blob (quando BLOB_READ_WRITE_TOKEN existe): URLs públicas do Blob
 * Todas as funções são assíncronas para os dois modos terem a mesma interface.
 */

const FILE_RE = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const ID_RE = /^[0-9a-f-]{36}$/;
const LOCAL_URL_RE = /^\/m\/([0-9a-f-]{36})\/([a-z0-9-]+\.(?:jpg|png|webp))$/;

function createDiskMedia(dataDir) {
  const root = path.join(dataDir || path.join(os.tmpdir(), 'appsites-media'), 'media');

  function file(leadId, name) {
    if (!ID_RE.test(leadId) || !FILE_RE.test(name)) return null;
    const f = path.join(root, leadId, name);
    return fs.existsSync(f) ? f : null;
  }

  function fileFromUrl(url) {
    const m = String(url || '').match(LOCAL_URL_RE);
    return m ? file(m[1], m[2]) : null;
  }

  return {
    kind: 'disk',
    async save(leadId, name, buffer) {
      if (!ID_RE.test(leadId)) throw new Error('ID inválido');
      if (!FILE_RE.test(name)) throw new Error('Nome de arquivo inválido');
      const dir = path.join(root, leadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buffer);
      return '/m/' + leadId + '/' + name;
    },
    async read(url) {
      const f = fileFromUrl(url);
      return f ? fs.readFileSync(f) : null;
    },
    async remove(url) {
      const f = fileFromUrl(url);
      if (f) fs.unlinkSync(f);
    },
    async removeAll(leadId) {
      if (ID_RE.test(leadId)) fs.rmSync(path.join(root, leadId), { recursive: true, force: true });
    },
    isLocal(url) {
      return LOCAL_URL_RE.test(String(url || ''));
    },
    /** Caminho no disco para servir /m/... (somente modo disco). */
    file,
  };
}

function createBlobMedia(token) {
  const blob = require('@vercel/blob');
  const opts = token ? { token } : {};
  return {
    kind: 'blob',
    async save(leadId, name, buffer, contentType) {
      if (!ID_RE.test(leadId) || !FILE_RE.test(name)) throw new Error('Nome de arquivo inválido');
      const r = await blob.put('media/' + leadId + '/' + name, buffer, Object.assign({
        access: 'public',
        addRandomSuffix: true,
        contentType: contentType || 'image/jpeg',
      }, opts));
      return r.url;
    },
    async read(url) {
      if (!/^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(String(url || ''))) return null;
      const res = await fetch(url);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
    async remove(url) {
      if (/\.blob\.vercel-storage\.com\//.test(String(url || ''))) await blob.del(url, opts);
    },
    async removeAll(leadId) {
      if (!ID_RE.test(leadId)) return;
      const { blobs } = await blob.list(Object.assign({ prefix: 'media/' + leadId + '/' }, opts));
      if (blobs.length) await blob.del(blobs.map((b) => b.url), opts);
    },
    isLocal() {
      return false;
    },
    file() {
      return null;
    },
  };
}

/**
 * Fotos no Supabase Storage (bucket público, criado automaticamente na primeira foto).
 * options.client permite injetar um cliente nos testes.
 */
function createSupabaseMedia(url, serviceKey, options) {
  options = options || {};
  const bucket = options.bucket || 'appsites-media';
  const client = options.client || require('@supabase/supabase-js').createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const files = () => client.storage.from(bucket);
  let bucketReady = null;

  function ensureBucket() {
    if (!bucketReady) {
      bucketReady = (async () => {
        const got = await client.storage.getBucket(bucket);
        if (got.data) return;
        const made = await client.storage.createBucket(bucket, { public: true, fileSizeLimit: '10MB' });
        if (made.error && !/exist/i.test(made.error.message)) throw new Error('Supabase Storage: ' + made.error.message);
      })().catch((e) => {
        bucketReady = null;
        throw e;
      });
    }
    return bucketReady;
  }

  // Caminho dentro do bucket a partir da URL pública
  const marker = '/storage/v1/object/public/' + bucket + '/';
  function pathFromUrl(u) {
    const i = String(u || '').indexOf(marker);
    return i >= 0 ? decodeURIComponent(String(u).slice(i + marker.length).split('?')[0]) : null;
  }

  return {
    kind: 'supabase',
    async save(leadId, name, buffer, contentType) {
      if (!ID_RE.test(leadId) || !FILE_RE.test(name)) throw new Error('Nome de arquivo inválido');
      await ensureBucket();
      // Sufixo aleatório: evita cache de foto antiga com o mesmo nome
      const p = 'media/' + leadId + '/' + name.replace(/(\.\w+)$/, '-' + Math.random().toString(36).slice(2, 8) + '$1');
      const { error } = await files().upload(p, buffer, { contentType: contentType || 'image/jpeg', upsert: true, cacheControl: '604800' });
      if (error) throw new Error('Supabase Storage: ' + error.message);
      return files().getPublicUrl(p).data.publicUrl;
    },
    async read(u) {
      if (!pathFromUrl(u)) return null;
      const res = await fetch(u);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
    async remove(u) {
      const p = pathFromUrl(u);
      if (!p) return;
      const { error } = await files().remove([p]);
      if (error) throw new Error('Supabase Storage: ' + error.message);
    },
    async removeAll(leadId) {
      if (!ID_RE.test(leadId)) return;
      const prefix = 'media/' + leadId;
      const { data, error } = await files().list(prefix, { limit: 1000 });
      if (error) throw new Error('Supabase Storage: ' + error.message);
      if (data && data.length) await files().remove(data.map((f) => prefix + '/' + f.name));
    },
    isLocal() {
      return false;
    },
    file() {
      return null;
    },
  };
}

function extFor(contentType) {
  if (/png/.test(contentType)) return 'png';
  if (/webp/.test(contentType)) return 'webp';
  return 'jpg';
}

module.exports = { createDiskMedia, createBlobMedia, createSupabaseMedia, extFor, LOCAL_URL_RE };
