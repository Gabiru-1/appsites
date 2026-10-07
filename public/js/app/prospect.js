/* Prospectar: busca de negócios no Google Maps com filtros. */
(function () {
  'use strict';
  const { h, api, toast } = window.UI;
  const App = window.App;
  const CACHE_KEY = 'appsites:lastSearch';

  function loadCache() {
    try {
      return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function saveCache(v) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(v));
    } catch (e) {
      // sem armazenamento disponível
    }
  }

  function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', null, hint) : null);
  }

  function select(name, options, value) {
    return h('select', { name }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  }

  App.views.prospectar = async function () {
    const cache = loadCache();
    const f = (cache && cache.form) || { niche: '', location: '', minRating: '0', minReviews: '0', website: 'without', phone: 'with', pages: '1', photos: false };

    const results = h('div', { class: 'results' });
    const status = h('div', { class: 'results-status' });

    const form = h('form', { class: 'card search-form', onsubmit: (e) => { e.preventDefault(); run(); } },
      h('div', { class: 'search-main' },
        field('Nicho', h('input', { name: 'niche', type: 'text', value: f.niche, placeholder: 'Ex.: pizzaria, dentista, barbearia', required: true })),
        field('Cidade / região', h('input', { name: 'location', type: 'text', value: f.location, placeholder: 'Ex.: Curitiba PR, Moema São Paulo' })),
        h('button', { class: 'btn btn-primary search-btn', type: 'submit' }, '⌕ Buscar')),
      h('div', { class: 'search-filters' },
        field('Nota mínima', select('minRating', [['0', 'Qualquer'], ['3.5', '3,5+'], ['4', '4,0+'], ['4.5', '4,5+']], f.minRating)),
        field('Mín. de avaliações', h('input', { name: 'minReviews', type: 'number', min: '0', value: f.minReviews })),
        field('Site', select('website', [['any', 'Tanto faz'], ['without', 'Sem site (oportunidade)'], ['with', 'Com site']], f.website)),
        field('Telefone', select('phone', [['any', 'Tanto faz'], ['with', 'Com telefone']], f.phone)),
        field('Quantidade', select('pages', [['1', 'Até 20'], ['2', 'Até 40'], ['3', 'Até 60']], f.pages), 'Mais resultados = mais chamadas à API'),
        h('label', { class: 'check', style: 'align-self:end;padding-bottom:8px' },
          h('input', { type: 'checkbox', name: 'photos', checked: Boolean(f.photos) }), 'Mostrar fotos')));

    async function run() {
      const fd = new FormData(form);
      const body = {
        niche: fd.get('niche'), location: fd.get('location'), minRating: Number(fd.get('minRating')),
        minReviews: Number(fd.get('minReviews')), website: fd.get('website'), phone: fd.get('phone'), pages: Number(fd.get('pages')),
      };
      const showPhotos = form.photos.checked;
      status.replaceChildren(App.loading());
      results.replaceChildren();
      try {
        const data = await api('POST', '/api/prospect/search', body);
        saveCache({ form: Object.assign({}, body, { photos: showPhotos }), data });
        show(data, showPhotos);
      } catch (e) {
        status.replaceChildren(h('div', { class: 'notice notice-error' }, e.message));
      }
    }

    function show(data, showPhotos) {
      const hidden = data.totalFound - data.results.length;
      status.replaceChildren(h('p', { class: 'muted' },
        h('strong', null, data.results.length + ' resultados'), ' para "' + data.query + '"',
        hidden > 0 ? ' · ' + hidden + ' escondidos pelos filtros' : ''));
      if (!data.results.length) {
        results.replaceChildren(App.empty('Nada encontrado', 'Tente afrouxar os filtros ou mudar a região.'));
        return;
      }
      results.replaceChildren(...data.results.map((p) => card(p, showPhotos)));
    }

    function card(p, showPhotos) {
      const action = h('div', { class: 'result-actions' });
      const renderAction = () => {
        if (p.leadId) {
          action.replaceChildren(h('a', { class: 'btn btn-sm', href: '#/leads/' + p.leadId }, '✓ Ver lead'));
        } else {
          action.replaceChildren(h('button', {
            class: 'btn btn-sm btn-primary',
            onclick: async (e) => {
              e.target.disabled = true;
              e.target.textContent = 'Salvando e importando fotos…';
              try {
                const lead = await api('POST', '/api/leads', { placeId: p.placeId });
                p.leadId = lead.id;
                const c = loadCache();
                if (c) {
                  const r = c.data.results.find((x) => x.placeId === p.placeId);
                  if (r) r.leadId = lead.id;
                  saveCache(c);
                }
                toast('Lead salvo com ' + (lead.photos || []).length + ' fotos');
                renderAction();
              } catch (err) {
                toast(err.message, true);
                e.target.disabled = false;
                e.target.textContent = '+ Salvar lead';
              }
            },
          }, '+ Salvar lead'));
        }
        if (p.mapsUrl) action.append(h('a', { class: 'btn btn-sm', href: p.mapsUrl, target: '_blank', rel: 'noopener' }, 'Maps ↗'));
      };
      renderAction();
      return h('article', { class: 'result' },
        showPhotos && p.fotoCapa ? h('img', { class: 'result-photo', loading: 'lazy', alt: '', src: '/api/prospect/photo?name=' + encodeURIComponent(p.fotoCapa) }) : null,
        h('div', { class: 'result-body' },
          h('div', { class: 'result-top' },
            h('h3', null, p.nome),
            p.website ? h('a', { class: 'tag', href: p.website, target: '_blank', rel: 'noopener' }, 'tem site') : h('span', { class: 'tag tag-hot' }, 'sem site')),
          h('div', { class: 'result-meta' },
            App.stars(p.avaliacao), h('span', { class: 'muted' }, '(' + p.totalAvaliacoes + ')'),
            p.categoria ? h('span', null, '· ' + p.categoria) : null),
          h('div', { class: 'result-meta' }, p.telefone ? '📞 ' + p.telefone : h('span', { class: 'muted' }, 'sem telefone')),
          h('div', { class: 'result-meta muted' }, p.enderecoCurto || p.endereco)),
        action);
    }

    const page = h('div', null,
      App.header('Prospectar', 'Encontre negócios no Google Maps e salve os melhores como leads.'),
      App.settings.hasGoogle ? null : App.needsKey('google'),
      form, status, results);

    if (cache && cache.data) show(cache.data, cache.form && cache.form.photos);
    return page;
  };
})();
