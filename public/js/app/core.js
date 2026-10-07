/* Núcleo do aplicativo: rotas, usuário logado e componentes comuns. */
(function () {
  'use strict';
  const { h, api, toast } = window.UI;

  const STATUS = {
    novo: { label: 'Novo', cls: 'st-novo' },
    contatado: { label: 'Contatado', cls: 'st-contatado' },
    negociando: { label: 'Negociando', cls: 'st-negociando' },
    vendido: { label: 'Vendido', cls: 'st-vendido' },
    perdido: { label: 'Perdido', cls: 'st-perdido' },
  };

  const App = {
    views: {},
    me: null,
    settings: null,
    STATUS,

    async start() {
      try {
        const me = await api('GET', '/api/auth/me');
        App.me = me.user;
        App.settings = me.settings;
      } catch (e) {
        return; // api() já redireciona para o login
      }
      renderUser();
      window.addEventListener('hashchange', route);
      route();
    },

    go(hash) {
      if (location.hash === hash) route();
      else location.hash = hash;
    },

    async refreshSettings() {
      App.settings = await api('GET', '/api/settings');
    },

    // Cabeçalho padrão das telas
    header(title, subtitle, actions) {
      return h('div', { class: 'page-head' },
        h('div', null, h('h1', null, title), subtitle ? h('p', null, subtitle) : null),
        actions ? h('div', { class: 'page-actions-row' }, actions) : null);
    },

    stars(n) {
      if (n == null || n === '') return h('span', { class: 'muted' }, 'sem nota');
      return h('span', { class: 'rating' }, h('span', { class: 'star' }, '★'), ' ', String(n).replace('.', ','));
    },

    statusBadge(status) {
      const s = STATUS[status] || { label: status, cls: '' };
      return h('span', { class: 'status ' + s.cls }, s.label);
    },

    statusSelect(value, onChange) {
      return h('select', { class: 'input input-sm', 'aria-label': 'Status do lead', onchange: (e) => onChange(e.target.value) },
        Object.entries(STATUS).map(([k, s]) => h('option', { value: k, selected: k === value }, s.label)));
    },

    empty(title, text, action) {
      return h('div', { class: 'empty-state' }, h('h2', null, title), text ? h('p', null, text) : null, action || null);
    },

    loading() {
      return h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Carregando…');
    },

    // Aviso quando falta configurar uma chave
    needsKey(kind) {
      const map = {
        google: ['Configure sua chave da API do Google', 'A prospecção usa a sua própria chave da Google Places API.'],
        vercel: ['Configure seu token da Vercel', 'Para publicar sites na Vercel com um clique.'],
        anthropic: ['Configure sua chave da Anthropic', 'Para a IA escrever os textos dos sites.'],
      };
      const [t, d] = map[kind];
      return h('div', { class: 'notice' }, h('div', null, h('strong', null, t), h('p', null, d)),
        h('a', { class: 'btn btn-sm btn-primary', href: '#/config' }, 'Configurar'));
    },

    // Abre a mensagem de abordagem no WhatsApp para um lead
    outreachText(lead, siteUrl) {
      const d = lead.data || lead;
      const tpl = (App.settings && App.settings.outreachMessage) || '';
      const nota = d.avaliacao ? ' (nota ' + String(d.avaliacao).replace('.', ',') + ' com ' + d.totalAvaliacoes + ' avaliações, parabéns!)' : '';
      return tpl
        .replace(/\{nome\}/g, d.nome || '')
        .replace(/\{nota\}/g, nota)
        .replace(/\{cidade\}/g, d.cidade || '')
        .replace(/\{link\}/g, siteUrl || '[link do site]')
        .replace(/\{empresa\}/g, (App.settings && App.settings.companyName) || App.me.name);
    },

    whatsappNumber(d) {
      const intl = String(d.telefoneInternacional || '').replace(/\D/g, '');
      if (intl.length >= 12) return intl;
      const nat = String(d.telefone || '').replace(/\D/g, '');
      return nat.length === 10 || nat.length === 11 ? '55' + nat : nat;
    },
  };

  function renderUser() {
    $('nav-user').replaceChildren(
      h('div', { class: 'nav-user-name' }, App.me.name, App.me.role === 'admin' ? h('small', null, ' · admin') : null),
      h('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: async () => {
          await api('POST', '/api/auth/logout');
          location.href = '/login';
        },
      }, 'Sair'));
  }

  function $(id) {
    return document.getElementById(id);
  }

  let seq = 0;
  async function route() {
    const raw = location.hash.replace(/^#\/?/, '') || 'painel';
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const name = parts[0] || 'painel';
    const view = App.views[name] || App.views.painel;
    document.querySelectorAll('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
    const el = $('view');
    el.replaceChildren(App.loading());
    const my = ++seq;
    try {
      const out = await view({ params: parts.slice(1), query: new URLSearchParams(queryPart || '') });
      if (my !== seq) return; // usuário já navegou para outra tela
      el.replaceChildren(out);
      el.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } catch (e) {
      if (my !== seq) return;
      el.replaceChildren(App.empty('Algo deu errado', e.message));
      toast(e.message, true);
    }
  }

  window.App = App;
})();
