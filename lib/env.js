'use strict';

/**
 * Encontra variáveis de ambiente mesmo quando a integração da Vercel
 * adiciona um prefixo ao nome (ex.: STORAGE_POSTGRES_URL, SUPABASE_POSTGRES_URL).
 */

function findEnv(env, names, exclude) {
  for (const n of names) if (env[n]) return { name: n, value: env[n] };
  const keys = Object.keys(env).sort();
  for (const n of names) {
    const k = keys.find((key) => key.endsWith('_' + n) && env[key] && !(exclude && exclude.test(key)));
    if (k) return { name: k, value: env[k] };
  }
  return null;
}

function resolveConfig(env) {
  const db = findEnv(env, ['DATABASE_URL', 'POSTGRES_URL'], /NON_POOLING|UNPOOLED|PRISMA/);
  const supabaseUrl = findEnv(env, ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const supabaseKey = findEnv(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);
  const blob = findEnv(env, ['BLOB_READ_WRITE_TOKEN']);
  return { db, supabaseUrl, supabaseKey, blob };
}

// Nomes (nunca valores) das variáveis ligadas ao banco/fotos, para a tela de ajuda
function relevantNames(env) {
  return Object.keys(env)
    .filter((k) => /POSTGRES|DATABASE|SUPABASE|BLOB|APP_SECRET|PGHOST|PGUSER/.test(k))
    .sort();
}

module.exports = { findEnv, resolveConfig, relevantNames };
