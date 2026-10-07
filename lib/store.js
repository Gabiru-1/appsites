'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Armazenamento simples em arquivo JSON, com escrita atômica.
 * Estrutura: { pages: [], submissions: [] }
 */
class Store {
  constructor(file) {
    this.file = file;
    this.data = { pages: [], submissions: [] };
    if (file && fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data.pages = Array.isArray(raw.pages) ? raw.pages : [];
      this.data.submissions = Array.isArray(raw.submissions) ? raw.submissions : [];
    }
  }

  save() {
    if (!this.file) return; // modo em memória (testes)
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  listPages() {
    return this.data.pages.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  getPage(id) {
    return this.data.pages.find((p) => p.id === id) || null;
  }

  getPageBySlug(slug) {
    return this.data.pages.find((p) => p.slug === slug) || null;
  }

  insertPage(page) {
    this.data.pages.push(page);
    this.save();
    return page;
  }

  updatePage(id, page) {
    const i = this.data.pages.findIndex((p) => p.id === id);
    if (i < 0) return null;
    this.data.pages[i] = page;
    this.save();
    return page;
  }

  deletePage(id) {
    const before = this.data.pages.length;
    this.data.pages = this.data.pages.filter((p) => p.id !== id);
    this.data.submissions = this.data.submissions.filter((s) => s.pageId !== id);
    this.save();
    return this.data.pages.length !== before;
  }

  addSubmission(sub) {
    this.data.submissions.push(sub);
    this.save();
    return sub;
  }

  listSubmissions(pageId) {
    return this.data.submissions
      .filter((s) => s.pageId === pageId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  deleteSubmission(pageId, subId) {
    const before = this.data.submissions.length;
    this.data.submissions = this.data.submissions.filter((s) => !(s.pageId === pageId && s.id === subId));
    this.save();
    return this.data.submissions.length !== before;
  }

  countSubmissions(pageId) {
    return this.data.submissions.reduce((n, s) => n + (s.pageId === pageId ? 1 : 0), 0);
  }
}

module.exports = { Store };
