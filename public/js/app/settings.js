/* Configurações: chaves de API, mensagem de abordagem, conta. */
(function () {
  'use strict';
  const { h, api, toast } = window.UI;
  const App = window.App;

  function keyField(label, name, current, help) {
    const input = h('input', { type: 'password', name, placeholder: current || 'Não configurada', autocomplete: 'off' });
    return h('label', { class: 'field' }, h('span', null, label, current ? h('span', { class: 'ok-pill' }, '✓ configurada') : null), input, h('small', null, help));
  }

  App.views.config = async function () {
    const s = await api('GET', '/api/settings');
    const form = h('form', {
      class: 'card form-stack',
      onsubmit: async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const body = {
          name: fd.get('name'),
          companyName: fd.get('companyName'),
          vercelTeamId: fd.get('vercelTeamId'),
          outreachMessage: fd.get('outreachMessage'),
        };
        for (const k of ['googleApiKey', 'anthropicApiKey', 'vercelToken']) if (fd.get(k)) body[k] = fd.get(k);
        try {
          App.settings = await api('PUT', '/api/settings', body);
          App.me.name = body.name || App.me.name;
          toast('Configurações salvas');
          App.go('#/config');
        } catch (err) {
          toast(err.message, true);
        }
      },
    },
      h('h2', { class: 'card-title' }, 'Perfil'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, 'Seu nome'), h('input', { type: 'text', name: 'name', value: App.me.name })),
        h('label', { class: 'field' }, h('span', null, 'Nome da sua empresa/agência'), h('input', { type: 'text', name: 'companyName', value: s.companyName }))),

      h('h2', { class: 'card-title' }, 'Google Maps (prospecção)'),
      keyField('Chave da Google Places API', 'googleApiKey', s.googleApiKey,
        'No Google Cloud Console: crie um projeto → ative a "Places API (New)" → Credenciais → Criar chave de API. Ative o faturamento (o Google dá um crédito mensal gratuito).'),
      h('p', { class: 'muted small' }, h('a', { href: 'https://console.cloud.google.com/apis/library/places.googleapis.com', target: '_blank', rel: 'noopener' }, 'Abrir a Places API no Google Cloud ↗')),

      h('h2', { class: 'card-title' }, 'Vercel (publicação)'),
      keyField('Token da Vercel', 'vercelToken', s.vercelToken, 'Em vercel.com → Account Settings → Tokens → Create. Cada site vira um projeto na sua conta Vercel.'),
      h('label', { class: 'field' }, h('span', null, 'Team ID (opcional)'), h('input', { type: 'text', name: 'vercelTeamId', value: s.vercelTeamId, placeholder: 'team_…' }),
        h('small', null, 'Só se for publicar dentro de um time da Vercel.')),

      h('h2', { class: 'card-title' }, 'IA para textos (opcional)'),
      keyField('Chave da Anthropic (Claude)', 'anthropicApiKey', s.anthropicApiKey, 'Em console.anthropic.com → API Keys. Usada para escrever títulos, textos e serviços dos sites.'),

      h('h2', { class: 'card-title' }, 'Mensagem de abordagem (WhatsApp)'),
      h('label', { class: 'field' },
        h('span', null, 'Modelo da mensagem'),
        h('textarea', { name: 'outreachMessage', rows: '6', value: s.outreachMessage }),
        h('small', null, 'Variáveis: {nome} (nome do negócio), {nota} (nota no Google), {cidade}, {link} (link do site), {empresa} (sua empresa).')),

      h('div', null, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar configurações')));

    const pwd = h('form', {
      class: 'card form-stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('POST', '/api/account/password', { current: pwd.current.value, next: pwd.next.value });
          pwd.reset();
          toast('Senha alterada');
        } catch (err) {
          toast(err.message, true);
        }
      },
    },
      h('h2', { class: 'card-title' }, 'Alterar senha'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, 'Senha atual'), h('input', { type: 'password', name: 'current', autocomplete: 'current-password' })),
        h('label', { class: 'field' }, h('span', null, 'Nova senha'), h('input', { type: 'password', name: 'next', autocomplete: 'new-password', minlength: '8' }))),
      h('div', null, h('button', { class: 'btn', type: 'submit' }, 'Alterar senha')));

    return h('div', null,
      App.header('Configurações', 'Suas chaves ficam criptografadas no servidor e nunca aparecem no navegador.'),
      form, pwd);
  };
})();
