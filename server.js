'use strict';

const path = require('path');
const { Store } = require('./lib/store.js');
const { createApp } = require('./lib/app.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const store = new Store(path.join(DATA_DIR, 'db.json'));
const app = createApp(store, {
  dataDir: DATA_DIR,
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
});

app.listen(PORT, () => {
  console.log('AppSites rodando em http://localhost:' + PORT);
  if (!store.all('users').length) {
    console.log('Nenhum usuário ainda: o primeiro cadastro vira administrador.');
  }
});
