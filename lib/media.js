'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Fotos importadas do Google ficam em <dataDir>/media/<leadId>/foto-N.jpg
 * e são servidas publicamente em /m/<leadId>/foto-N.jpg (os sites publicados usam essas fotos).
 */

const FILE_RE = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const ID_RE = /^[0-9a-f-]{36}$/;

function createMedia(dataDir) {
  const root = path.join(dataDir || path.join(require('os').tmpdir(), 'appsites-media'), 'media');

  function dirFor(leadId) {
    if (!ID_RE.test(leadId)) throw new Error('ID inválido');
    return path.join(root, leadId);
  }

  return {
    root,
    save(leadId, name, buffer) {
      if (!FILE_RE.test(name)) throw new Error('Nome de arquivo inválido');
      const dir = dirFor(leadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buffer);
      return '/m/' + leadId + '/' + name;
    },
    file(leadId, name) {
      if (!ID_RE.test(leadId) || !FILE_RE.test(name)) return null;
      const f = path.join(root, leadId, name);
      return fs.existsSync(f) ? f : null;
    },
    remove(leadId, name) {
      const f = this.file(leadId, name);
      if (f) fs.unlinkSync(f);
    },
    removeAll(leadId) {
      if (!ID_RE.test(leadId)) return;
      fs.rmSync(path.join(root, leadId), { recursive: true, force: true });
    },
    /** Lê um caminho /m/<leadId>/<arquivo> (ou null se não for mídia local). */
    resolveUrl(url) {
      const m = String(url || '').match(/^\/m\/([0-9a-f-]{36})\/([a-z0-9-]+\.(?:jpg|png|webp))$/);
      return m ? this.file(m[1], m[2]) : null;
    },
  };
}

function extFor(contentType) {
  if (/png/.test(contentType)) return 'png';
  if (/webp/.test(contentType)) return 'webp';
  return 'jpg';
}

module.exports = { createMedia, extFor };
