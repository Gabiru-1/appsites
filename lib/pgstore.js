'use strict';

const { Store } = require('./store.js');

/**
 * Armazenamento em Postgres (usado na Vercel, onde não há disco permanente).
 *
 * Cada documento vira uma linha em "docs" (coleção, id, dados JSON).
 * A cada requisição: carrega tudo (open), o código trabalha em memória como no modo arquivo,
 * e no final (flush) só os documentos que mudaram são gravados ou apagados.
 */

const SCHEMA = `create table if not exists docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
)`;

// Garante a tabela uma vez por conexão
const schemaReady = new WeakMap();

class PgStore extends Store {
  constructor(sql) {
    super(null);
    this.sql = sql;
    this.snapshot = new Map();
  }

  static async open(sql) {
    if (!schemaReady.has(sql)) {
      schemaReady.set(sql, sql.query(SCHEMA).catch((e) => {
        schemaReady.delete(sql);
        throw e;
      }));
    }
    await schemaReady.get(sql);
    const store = new PgStore(sql);
    const rows = await sql.query('select collection, id, data from docs');
    for (const r of rows) {
      if (!store.data[r.collection]) continue;
      store.data[r.collection].push(r.data);
      store.snapshot.set(r.collection + '\u0000' + r.id, JSON.stringify(r.data));
    }
    return store;
  }

  // As alterações são gravadas em lote no flush()
  save() {}

  async flush() {
    const current = new Map();
    for (const col of Object.keys(this.data)) {
      for (const doc of this.data[col]) current.set(col + '\u0000' + doc.id, { col, doc });
    }
    const writes = [];
    for (const [key, { col, doc }] of current) {
      const json = JSON.stringify(doc);
      if (this.snapshot.get(key) !== json) {
        writes.push(this.sql.query(
          'insert into docs (collection, id, data) values ($1, $2, $3::jsonb) ' +
          'on conflict (collection, id) do update set data = excluded.data, updated_at = now()',
          [col, String(doc.id), json]));
        this.snapshot.set(key, json);
      }
    }
    for (const key of [...this.snapshot.keys()]) {
      if (!current.has(key)) {
        const [col, id] = key.split('\u0000');
        writes.push(this.sql.query('delete from docs where collection = $1 and id = $2', [col, id]));
        this.snapshot.delete(key);
      }
    }
    await Promise.all(writes);
    return writes.length;
  }
}

module.exports = { PgStore, SCHEMA };
