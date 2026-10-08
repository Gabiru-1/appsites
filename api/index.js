'use strict';

/**
 * Entrada para a Vercel: todas as rotas chegam aqui (veja vercel.json).
 * Banco: Postgres (Supabase ou Neon). Fotos: Supabase Storage ou Vercel Blob.
 */

const { createHandler } = require('../lib/app.js');
const { createBlobMedia, createSupabaseMedia } = require('../lib/media.js');
const { PgStore } = require('../lib/pgstore.js');
const { connect } = require('../lib/db.js');
const { resolveConfig, relevantNames } = require('../lib/env.js');

const cfg = resolveConfig(process.env);

const problems = [];
if (!cfg.db) problems.push('Banco de dados não conectado (falta DATABASE_URL ou POSTGRES_URL)');

let media;
if (cfg.supabaseUrl && cfg.supabaseKey) media = createSupabaseMedia(cfg.supabaseUrl.value, cfg.supabaseKey.value);
else if (cfg.blob) media = createBlobMedia(cfg.blob.value);
else problems.push('Armazenamento de fotos não conectado (falta SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ou BLOB_READ_WRITE_TOKEN)');

const sql = cfg.db ? connect(cfg.db.value) : null;

module.exports = createHandler({
  configErrors: problems,
  envNames: relevantNames(process.env),
  media,
  openStore: () => PgStore.open(sql),
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
});
