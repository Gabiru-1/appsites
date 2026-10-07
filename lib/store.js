'use strict';

const fs = require('fs');
const path = require('path');

const COLLECTIONS = ['users', 'sessions', 'pages', 'submissions', 'leads', 'templates'];

/**
 * Armazenamento simples em arquivo JSON, com escrita atômica.
 * Cada coleção é uma lista de objetos com campo "id".
 */
class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    for (const c of COLLECTIONS) this.data[c] = [];
    if (file && fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const c of COLLECTIONS) {
        if (Array.isArray(raw[c])) this.data[c] = raw[c];
      }
    }
  }

  save() {
    if (!this.file) return; // modo em memória (testes)
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // No modo arquivo cada alteração já é gravada na hora; o modo Postgres sobrescreve.
  async flush() {
    return 0;
  }

  all(col) {
    return this.data[col];
  }

  filter(col, pred) {
    return this.data[col].filter(pred);
  }

  find(col, pred) {
    return this.data[col].find(pred) || null;
  }

  get(col, id) {
    return this.find(col, (x) => x.id === id);
  }

  insert(col, obj) {
    this.data[col].push(obj);
    this.save();
    return obj;
  }

  update(col, id, obj) {
    const i = this.data[col].findIndex((x) => x.id === id);
    if (i < 0) return null;
    this.data[col][i] = obj;
    this.save();
    return obj;
  }

  remove(col, pred) {
    const before = this.data[col].length;
    this.data[col] = this.data[col].filter((x) => !pred(x));
    const removed = before - this.data[col].length;
    if (removed) this.save();
    return removed;
  }

  count(col, pred) {
    return this.data[col].reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
  }
}

module.exports = { Store };
