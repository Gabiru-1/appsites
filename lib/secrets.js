'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Criptografa as chaves de API dos usuários (Google, Vercel, Anthropic) antes de salvar.
 * A chave mestra vem de APP_SECRET ou é gerada em data/secret.key na primeira execução.
 */
function loadMasterKey(dataDir) {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  if (process.env.VERCEL) throw new Error('Defina a variável APP_SECRET nas configurações do projeto na Vercel');
  if (!dataDir) return crypto.createHash('sha256').update('appsites-test-key').digest();
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
}

function createSecrets(dataDir) {
  const key = loadMasterKey(dataDir);
  return {
    encrypt(text) {
      if (!text) return '';
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
      return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
    },
    decrypt(value) {
      if (!value || !String(value).startsWith('v1:')) return '';
      try {
        const buf = Buffer.from(String(value).slice(3), 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        decipher.setAuthTag(buf.subarray(12, 28));
        return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
      } catch (e) {
        return '';
      }
    },
  };
}

// Mostra só o final da chave: "••••••abcd"
function mask(text) {
  if (!text) return '';
  return '••••••' + String(text).slice(-4);
}

module.exports = { createSecrets, mask };
