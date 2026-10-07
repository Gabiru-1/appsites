'use strict';

/**
 * Entrada para a Vercel: todas as rotas chegam aqui (veja vercel.json).
 * Banco: Postgres (Supabase ou Neon). Fotos: Supabase Storage ou Vercel Blob.
 */

const { createHandler } = require('../lib/app.js');
const { createBlobMedia, createSupabaseMedia } = require('../lib/media.js');
const { PgStore } = require('../lib/pgstore.js');
const { connect } = require('../lib/db.js');

const env = process.env;
const dbUrl = env.DATABASE_URL || env.POSTGRES_URL;
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const problems = [];
if (!dbUrl) problems.push('Banco de dados não conectado (falta DATABASE_URL ou POSTGRES_URL)');

let media;
if (supabaseUrl && supabaseKey) media = createSupabaseMedia(supabaseUrl, supabaseKey);
else if (env.BLOB_READ_WRITE_TOKEN) media = createBlobMedia();
else problems.push('Armazenamento de fotos não conectado (falta SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ou BLOB_READ_WRITE_TOKEN)');

const sql = dbUrl ? connect(dbUrl) : null;

module.exports = createHandler({
  configErrors: problems,
  media,
  openStore: () => PgStore.open(sql),
  allowSignup: env.ALLOW_SIGNUP !== 'false',
});
