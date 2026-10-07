/* Leads (CRM): lista e ficha completa com abas. */
(function () {
  'use strict';
  const { h, api, toast, money, copyText, formatDate } = window.UI;
  const App = window.App;

  // ---------- Lista ----------

  App.views.leads = async function (ctx) {
    if (ctx.params[0]) return leadDetail(ctx.params[0], ctx.query.get('aba'));
    const status = ctx.query.get('status') || '';
    const list = await api('GET', '/api/leads' + (status ? '?status=' + status : ''));
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar por nome ou cidade…', style: 'max-width:260px' });
    const body = h('tbody');

    function fill() {
      const q = search.value.trim().toLowerCase();
      const rows = list.filter((l) => !q || (l.nome + ' ' + (l.cidade || '')).toLowerCase().includes(q));
      body.replaceChildren(...rows.map((l) => h('tr', null,
        h('td', null, h('div', { class: 'lead-cell' },
          l.capa ? h('img', { src: l.capa, alt: '', class: 'thumb' }) : h('span', { class: 'thumb thumb-empty' }, l.nome.charAt(0)),
          h('div', null, h('a', { href: '#/leads/' + l.id, class: 'strong' }, l.nome),
            h('div', { class: 'muted small' }, [l.categoria, l.cidade].filter(Boolean).join(' · '))))),
        h('td', null, App.stars(l.avaliacao), ' ', h('span', { class: 'muted small' }, '(' + (l.totalAvaliacoes || 0) + ')')),
        h('td', null, l.telefone || h('span', { class: 'muted' }, '—')),
        h('td', null, App.statusSelect(l.status, async (v) => {
          try {
            await api('PUT', '/api/leads/' + l.id, { status: v });
            l.status = v;
            toast('Status atualizado');
          } catch (e) {
            toast(e.message, true);
          }
        })),
        h('td', null, l.valor ? money(l.valor) : h('span', { class: 'muted' }, '—')),
        h('td', null, l.siteId
          ? h('a', { href: '#/sites' }, 'Ver site')
          : h('a', { class: 'btn btn-sm', href: '#/criar?lead=' + l.id }, 'Criar site')))));
      if (!rows.length) body.replaceChildren(h('tr', null, h('td', { colspan: '6', class: 'muted center' }, 'Nenhum lead encontrado')));
    }
    search.addEventListener('input', fill);
    fill();

    const tabs = h('div', { class: 'pill-tabs' }, [['', 'Todos']].concat(Object.entries(App.STATUS).map(([k, s]) => [k, s.label])).map(([k, label]) =>
      h('a', { class: 'pill' + (k === status ? ' active' : ''), href: '#/leads' + (k ? '?status=' + k : '') }, label)));

    return h('div', null,
      App.header('Leads', 'Seus potenciais clientes. Acompanhe cada um até a venda.', [
        h('button', { class: 'btn', onclick: newManualLead }, '+ Lead manual'),
        h('a', { class: 'btn btn-primary', href: '#/prospectar' }, '⌕ Prospectar'),
      ]),
      h('div', { class: 'toolbar' }, tabs, search),
      !list.length && !status
        ? App.empty('Nenhum lead ainda', 'Use a aba Prospectar para encontrar negócios no Google Maps.', h('a', { class: 'btn btn-primary', href: '#/prospectar' }, 'Prospectar agora'))
        : h('div', { class: 'card card-flush' }, h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Negócio', 'Nota', 'Telefone', 'Status', 'Valor', 'Site'].map((t) => h('th', null, t)))), body))));
  };

  function newManualLead() {
    const inputs = {
      nome: h('input', { type: 'text', maxlength: '120' }),
      categoria: h('input', { type: 'text', placeholder: 'Ex.: Barbearia' }),
      cidade: h('input', { type: 'text' }),
      telefone: h('input', { type: 'text' }),
      endereco: h('input', { type: 'text' }),
    };
    const labels = { nome: 'Nome do negócio', categoria: 'Segmento', cidade: 'Cidade', telefone: 'Telefone / WhatsApp', endereco: 'Endereço' };
    const close = UI.modal('Novo lead manual', Object.entries(inputs).map(([k, el]) => h('label', { class: 'field' }, h('span', null, labels[k]), el)), [
      h('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          try {
            const body = {};
            for (const [k, el] of Object.entries(inputs)) body[k] = el.value;
            const lead = await api('POST', '/api/leads', body);
            close();
            App.go('#/leads/' + lead.id);
          } catch (e) {
            toast(e.message, true);
          }
        },
      }, 'Criar lead'),
    ]);
  }

  // ---------- Ficha do lead ----------

  async function leadDetail(id, initialTab) {
    let lead = await api('GET', '/api/leads/' + id);
    const sites = await api('GET', '/api/pages');
    const site = sites.find((s) => s.leadId === lead.id);
    const d = lead.data;
    const panel = h('div', { class: 'tab-panel' });
    const tabsEl = h('div', { class: 'tabs tabs-line', role: 'tablist' });

    const TABS = [
      ['info', 'Informações'],
      ['avaliacoes', 'Avaliações (' + (d.avaliacoes || []).length + ')'],
      ['fotos', 'Fotos (' + (lead.photos || []).length + ')'],
      ['horarios', 'Horários'],
      ['prompt', 'Prompt'],
      ['abordagem', 'Abordagem'],
      ['venda', 'Venda'],
    ];

    function selectTab(key) {
      tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === key));
      panel.replaceChildren(App.loading());
      Promise.resolve(RENDER[key]()).then((el) => panel.replaceChildren(el)).catch((e) => panel.replaceChildren(h('div', { class: 'notice notice-error' }, e.message)));
      history.replaceState(null, '', '#/leads/' + lead.id + '?aba=' + key);
    }

    function rebuildTabs() {
      tabsEl.replaceChildren(...TABS.map(([k, label]) => h('button', { class: 'tab', role: 'tab', 'data-tab': k, onclick: () => selectTab(k) }, label)));
    }

    const siteUrl = () => (site && site.vercel && site.vercel.url) || (site && site.published ? location.origin + '/p/' + site.slug : '');

    const RENDER = {
      info() {
        const rows = [
          ['Segmento', d.categoria],
          ['Telefone', d.telefone && h('span', null, h('a', { href: 'tel:' + d.telefone.replace(/[^\d+]/g, '') }, d.telefone), ' · ',
            h('a', { href: 'https://wa.me/' + App.whatsappNumber(d), target: '_blank', rel: 'noopener' }, 'WhatsApp'))],
          ['Endereço', d.endereco],
          ['Cidade', d.cidade],
          ['Nota no Google', d.avaliacao != null && h('span', null, App.stars(d.avaliacao), ' · ' + d.totalAvaliacoes + ' avaliações')],
          ['Site atual', d.website ? h('a', { href: d.website, target: '_blank', rel: 'noopener' }, d.website) : h('span', { class: 'tag tag-hot' }, 'Não tem site — oportunidade!')],
          ['Google Maps', d.mapsUrl && h('a', { href: d.mapsUrl, target: '_blank', rel: 'noopener' }, 'Abrir no Maps ↗')],
          ['Descrição', d.descricao],
          ['Situação', d.status === 'OPERATIONAL' ? 'Em funcionamento' : d.status === 'CLOSED_TEMPORARILY' ? 'Fechado temporariamente' : d.status],
          ['Salvo em', formatDate(lead.createdAt)],
        ].filter((r) => r[1]);
        return h('div', null,
          h('dl', { class: 'info-list' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
          lead.placeId ? h('button', {
            class: 'btn btn-sm',
            onclick: async () => {
              try {
                lead = Object.assign(lead, await api('POST', '/api/leads/' + lead.id + '/refresh'));
                toast('Dados atualizados do Google');
                App.go('#/leads/' + lead.id + '?aba=info');
              } catch (e) {
                toast(e.message, true);
              }
            },
          }, '↻ Atualizar dados do Google') : null);
      },

      avaliacoes() {
        const list = d.avaliacoes || [];
        if (!list.length) return h('p', { class: 'muted' }, 'Nenhuma avaliação com texto disponível. (O Google retorna no máximo 5 avaliações por local.)');
        return h('div', { class: 'reviews' }, list.map((r) => h('div', { class: 'review' },
          h('div', { class: 'review-head' }, h('strong', null, r.autor), h('span', { class: 'star' }, '★'.repeat(r.nota)), h('span', { class: 'muted small' }, r.quando)),
          h('p', null, r.texto))));
      },

      fotos() {
        const grid = h('div', { class: 'photo-grid' });
        const fill = () => {
          grid.replaceChildren(...(lead.photos || []).map((p) => h('figure', { class: 'photo' },
            h('img', { src: p.url, alt: p.name, loading: 'lazy' }),
            h('figcaption', null,
              h('a', { class: 'btn btn-sm', href: p.url, download: p.name }, '⬇ Baixar'),
              h('button', {
                class: 'btn btn-sm btn-danger',
                onclick: async () => {
                  const r = await api('DELETE', '/api/leads/' + lead.id + '/photos/' + p.name);
                  lead.photos = r.photos;
                  fill();
                },
              }, 'Remover'),
              p.autor ? h('small', { class: 'muted' }, '© ' + p.autor) : null))));
          if (!(lead.photos || []).length) grid.replaceChildren(h('p', { class: 'muted' }, 'Nenhuma foto importada ainda.'));
        };
        fill();
        const available = (d.fotosGoogle || []).length;
        return h('div', null,
          h('div', { class: 'toolbar' },
            h('a', { class: 'btn btn-primary btn-sm', href: '/api/leads/' + lead.id + '/photos.zip' }, '⬇ Baixar todas (.zip)'),
            available ? h('button', {
              class: 'btn btn-sm',
              onclick: async (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Importando…';
                try {
                  const r = await api('POST', '/api/leads/' + lead.id + '/photos/import', { max: 20 });
                  lead.photos = r.photos;
                  fill();
                  toast(r.errors.length ? 'Algumas fotos falharam: ' + r.errors[0] : 'Fotos importadas', Boolean(r.errors.length));
                } catch (err) {
                  toast(err.message, true);
                }
                e.target.disabled = false;
                e.target.textContent = '↻ Importar do Google';
              },
            }, '↻ Importar do Google') : null,
            h('span', { class: 'muted small' }, available + ' fotos disponíveis no Google. As fotos ficam salvas no servidor e já entram nos sites.')),
          grid);
      },

      horarios() {
        const list = d.horarios || [];
        if (!list.length) return h('p', { class: 'muted' }, 'Horário não informado no Google.');
        return h('dl', { class: 'info-list' }, list.map((line) => {
          const i = line.indexOf(':');
          return h('div', null, h('dt', null, line.slice(0, i)), h('dd', null, line.slice(i + 1)));
        }));
      },

      async prompt() {
        const { prompt } = await api('GET', '/api/leads/' + lead.id + '/sitedata');
        const ta = h('textarea', { class: 'prompt-box', readonly: true, rows: '18' });
        ta.value = prompt;
        return h('div', null,
          h('p', { class: 'muted' }, 'Tudo o que é preciso para criar o site: dados do Google Maps, avaliações, horários e links das fotos. Cole no construtor ("Criar site" → "Colar prompt") ou em qualquer IA.'),
          h('div', { class: 'toolbar' },
            h('button', {
              class: 'btn btn-primary',
              onclick: () => copyText(prompt).then(() => toast('Prompt copiado!')),
            }, '⧉ Copiar prompt'),
            h('a', { class: 'btn', href: '#/criar?lead=' + lead.id }, '✚ Criar site com estes dados')),
          ta);
      },

      abordagem() {
        const number = App.whatsappNumber(d);
        const text = App.outreachText(lead, siteUrl());
        const ta = h('textarea', { class: 'prompt-box', rows: '8' });
        ta.value = text;
        const waLink = () => 'https://wa.me/' + number + '?text=' + encodeURIComponent(ta.value);
        const open = h('a', { class: 'btn btn-primary', href: waLink(), target: '_blank', rel: 'noopener' }, '💬 Abrir no WhatsApp');
        ta.addEventListener('input', () => { open.href = waLink(); });
        return h('div', null,
          !siteUrl() ? h('div', { class: 'notice' }, h('div', null, h('strong', null, 'Dica: '), 'crie e publique o site primeiro. O link entra automaticamente na mensagem.'),
            h('a', { class: 'btn btn-sm', href: site ? '#/sites' : '#/criar?lead=' + lead.id }, site ? 'Publicar site' : 'Criar site')) : null,
          h('p', { class: 'muted' }, 'Mensagem pronta para enviar. Você pode editar o modelo padrão em Configurações.'),
          ta,
          h('div', { class: 'toolbar' },
            number ? open : h('span', { class: 'muted' }, 'Sem telefone para WhatsApp.'),
            h('button', { class: 'btn', onclick: () => copyText(ta.value).then(() => toast('Mensagem copiada')) }, '⧉ Copiar'),
            lead.status === 'novo' ? h('button', {
              class: 'btn',
              onclick: async () => {
                await api('PUT', '/api/leads/' + lead.id, { status: 'contatado' });
                lead.status = 'contatado';
                statusHolder.replaceChildren(statusControl());
                toast('Marcado como contatado');
              },
            }, 'Marcar como contatado') : null));
      },

      venda() {
        const valor = h('input', { type: 'number', min: '0', step: '0.01', value: lead.valor || '' });
        const mensal = h('input', { type: 'number', min: '0', step: '0.01', value: lead.mensalidade || '' });
        const data = h('input', { type: 'date', value: lead.vendidoEm || '' });
        const notes = h('textarea', { rows: '5', placeholder: 'Anotações sobre a negociação…' });
        notes.value = lead.notes || '';
        return h('form', {
          class: 'form-grid',
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              lead = Object.assign(lead, await api('PUT', '/api/leads/' + lead.id, {
                valor: valor.value || 0, mensalidade: mensal.value || 0, vendidoEm: data.value || null, notes: notes.value,
              }));
              toast('Salvo');
            } catch (err) {
              toast(err.message, true);
            }
          },
        },
          h('label', { class: 'field' }, h('span', null, 'Valor do site (R$)'), valor, h('small', null, 'Valor único cobrado pela criação')),
          h('label', { class: 'field' }, h('span', null, 'Mensalidade (R$)'), mensal, h('small', null, 'Hospedagem/manutenção, se houver')),
          h('label', { class: 'field' }, h('span', null, 'Data da venda'), data),
          h('label', { class: 'field field-wide' }, h('span', null, 'Anotações'), notes),
          h('div', { class: 'field-wide' },
            h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar'),
            lead.status !== 'vendido' ? h('span', { class: 'muted small', style: 'margin-left:10px' }, 'Para contar no painel, mude o status para "Vendido".') : null),
          h('div', { class: 'field-wide' }, h('h3', { class: 'card-title' }, 'Histórico'),
            h('ul', { class: 'timeline' }, (lead.history || []).slice().reverse().map((x) =>
              h('li', null, App.statusBadge(x.status), ' ', h('span', { class: 'muted small' }, formatDate(x.at)))))));
      },
    };

    const statusHolder = h('span');
    const statusControl = () => App.statusSelect(lead.status, async (v) => {
      try {
        lead = Object.assign(lead, await api('PUT', '/api/leads/' + lead.id, { status: v }));
        toast(v === 'vendido' ? 'Venda registrada! Informe o valor na aba Venda 🎉' : 'Status atualizado');
        if (v === 'vendido') selectTab('venda');
      } catch (e) {
        toast(e.message, true);
      }
    });
    statusHolder.append(statusControl());

    rebuildTabs();
    const view = h('div', null,
      h('a', { class: 'back-link', href: '#/leads' }, '← Leads'),
      h('div', { class: 'lead-head' },
        (lead.photos || [])[0] ? h('img', { class: 'lead-cover', src: lead.photos[0].url, alt: '' }) : null,
        h('div', { class: 'lead-title' },
          h('h1', null, d.nome),
          h('div', { class: 'result-meta' }, App.stars(d.avaliacao), d.totalAvaliacoes ? h('span', { class: 'muted' }, '(' + d.totalAvaliacoes + ' avaliações)') : null,
            d.categoria ? h('span', null, '· ' + d.categoria) : null, d.cidade ? h('span', null, '· ' + d.cidade) : null)),
        h('div', { class: 'lead-actions' },
          statusHolder,
          site
            ? h('a', { class: 'btn', href: (site.kind === 'html' ? '/site?id=' : '/editor?id=') + site.id }, '✎ Editar site')
            : h('a', { class: 'btn btn-primary', href: '#/criar?lead=' + lead.id }, '✚ Criar site'),
          h('button', {
            class: 'btn btn-danger',
            onclick: async () => {
              if (!confirm('Excluir este lead e as fotos importadas?')) return;
              await api('DELETE', '/api/leads/' + lead.id);
              toast('Lead excluído');
              App.go('#/leads');
            },
          }, 'Excluir'))),
      h('div', { class: 'card' }, tabsEl, panel));
    selectTab(TABS.some((t) => t[0] === initialTab) ? initialTab : 'info');
    return view;
  }
})();
