'use strict';

/**
 * Conexão com o Postgres a partir de uma URL.
 *  - Neon (vercel.com → Storage → Neon): driver HTTP da Neon, ideal para funções serverless.
 *  - Qualquer outro Postgres (Supabase, Railway, RDS…): driver "pg" com pool pequeno.
 * Devolve um objeto { query(texto, parametros) → linhas }.
 */

function isNeon(url) {
  try {
    return /\.neon\.tech$/i.test(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}

function connect(url) {
  if (isNeon(url)) {
    const { neon } = require('@neondatabase/serverless');
    return neon(url);
  }

  const { Pool } = require('pg');
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  // O "sslmode" da URL faz o driver exigir verificação completa do certificado,
  // que falha no pooler do Supabase; a conexão continua criptografada via "ssl" abaixo.
  for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'supa', 'pgbouncer']) parsed.searchParams.delete(k);
  const pool = new Pool({
    connectionString: parsed.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (e) => console.error('Postgres:', e.message));
  return {
    async query(text, params) {
      const r = await pool.query(text, params);
      return r.rows;
    },
    pool,
  };
}

module.exports = { connect, isNeon };
