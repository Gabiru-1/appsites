'use strict';

/**
 * Entrada para a Vercel: todas as rotas chegam aqui (veja vercel.json).
 * Dados no Postgres (Neon) e fotos no Vercel Blob, conectados pela aba Storage do projeto.
 */

const { createHandler } = require('../lib/app.js');
const { createBlobMedia } = require('../lib/media.js');
const { PgStore } = require('../lib/pgstore.js');

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const problems = [];
if (!dbUrl) problems.push('Banco de dados não conectado (falta a variável DATABASE_URL)');
if (!process.env.BLOB_READ_WRITE_TOKEN) problems.push('Armazenamento de fotos não conectado (falta a variável BLOB_READ_WRITE_TOKEN)');

let sql = null;
if (dbUrl) {
  const { neon } = require('@neondatabase/serverless');
  sql = neon(dbUrl);
}

module.exports = createHandler({
  configErrors: problems,
  media: process.env.BLOB_READ_WRITE_TOKEN ? createBlobMedia() : undefined,
  openStore: () => PgStore.open(sql),
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
});
