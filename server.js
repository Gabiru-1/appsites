'use strict';

const path = require('path');
const { Store } = require('./lib/store.js');
const { createApp } = require('./lib/app.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const store = new Store(DATA_FILE);
const app = createApp(store, { adminPassword: process.env.ADMIN_PASSWORD });

app.listen(PORT, () => {
  console.log('AppSites rodando em http://localhost:' + PORT);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Aviso: defina ADMIN_PASSWORD para proteger o painel de edição.');
  }
});
