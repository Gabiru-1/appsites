(function () {
  'use strict';
  const { h, api, toast, modal, formatDate } = window.UI;
  const PB = window.PageBlocks;

  const list = document.getElementById('list');
  const search = document.getElementById('search');
  let pages = [];

  async function load() {
    try {
      pages = await api('GET', '/api/pages');
      render();
    } catch (e) {
      list.replaceChildren(h('div', { class: 'empty-state' }, 'Erro ao carregar: ' + e.message));
    }
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const filtered = pages.filter((p) => !q || p.title.toLowerCase().includes(q) || p.slug.includes(q));
    if (!pages.length) {
      list.replaceChildren(h('div', { class: 'empty-state' },
        h('h2', null, 'Nenhuma página ainda'),
        h('p', null, 'Crie sua primeira página a partir de um modelo pronto.'),
        h('button', { class: 'btn btn-primary', onclick: openNew }, '+ Criar página')));
      return;
    }
    if (!filtered.length) {
      list.replaceChildren(h('div', { class: 'empty-state' }, 'Nenhuma página encontrada para "' + q + '".'));
      return;
    }
    list.replaceChildren(h('div', { class: 'page-grid' }, filtered.map(card)));
  }

  function card(p) {
    const editUrl = '/editor.html?id=' + encodeURIComponent(p.id);
    const thumb = h('iframe', { title: 'Miniatura de ' + p.title, loading: 'lazy', tabindex: '-1' });
    // Carrega a página completa para gerar a miniatura
    api('GET', '/api/pages/' + p.id).then((full) => {
      thumb.srcdoc = window.PageRenderer.renderPage(full, {});
    }).catch(() => {});

    return h('article', { class: 'page-card' },
      h('div', { class: 'page-thumb', onclick: () => { location.href = editUrl; } }, thumb),
      h('div', { class: 'page-body' },
        h('h3', { class: 'page-title' }, p.title),
        h('div', { class: 'page-meta' },
          h('span', { class: 'badge ' + (p.published ? 'badge-live' : 'badge-draft') }, p.published ? 'Publicada' : 'Rascunho'),
          h('span', null, '/p/' + p.slug),
          h('span', null, p.blockCount + ' blocos')),
        h('div', { class: 'page-meta' }, 'Editada em ' + formatDate(p.updatedAt))),
      h('div', { class: 'page-actions' },
        h('a', { class: 'btn btn-primary btn-sm', href: editUrl }, 'Editar'),
        p.published ? h('a', { class: 'btn btn-sm', href: '/p/' + p.slug, target: '_blank', rel: 'noopener' }, 'Ver ↗') : null,
        h('button', { class: 'btn btn-sm', onclick: () => duplicate(p) }, 'Duplicar'),
        h('button', { class: 'btn btn-sm', onclick: () => openSubmissions(p) }, 'Mensagens (' + p.submissionCount + ')'),
        h('button', { class: 'btn btn-sm btn-danger', onclick: () => remove(p) }, 'Excluir')));
  }

  function openNew() {
    let selected = 'landing';
    const title = h('input', { type: 'text', placeholder: 'Ex.: Minha landing page', maxlength: '120' });
    const options = Object.entries(PB.TEMPLATES).map(([id, t]) =>
      h('button', {
        type: 'button',
        class: 'template-opt' + (id === selected ? ' selected' : ''),
        'data-id': id,
        onclick: (e) => {
          selected = id;
          e.currentTarget.parentNode.querySelectorAll('.template-opt').forEach((b) => b.classList.toggle('selected', b.dataset.id === id));
        },
      }, h('strong', null, t.label), h('span', null, t.description)));

    const create = async () => {
      try {
        const page = await api('POST', '/api/pages', { title: title.value, template: selected });
        location.href = '/editor.html?id=' + encodeURIComponent(page.id);
      } catch (e) {
        toast(e.message, true);
      }
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });

    modal('Nova página', [
      h('label', { class: 'field' }, h('span', null, 'Nome da página'), title),
      h('div', { class: 'field' }, h('span', null, 'Modelo'), h('div', { class: 'template-grid' }, options)),
    ], [h('button', { class: 'btn btn-primary', onclick: create }, 'Criar e editar')]);
  }

  async function duplicate(p) {
    try {
      await api('POST', '/api/pages/' + p.id + '/duplicate');
      toast('Página duplicada');
      load();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function remove(p) {
    if (!confirm('Excluir a página "' + p.title + '"? Esta ação não pode ser desfeita.')) return;
    try {
      await api('DELETE', '/api/pages/' + p.id);
      toast('Página excluída');
      load();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function openSubmissions(p) {
    const box = h('div', { class: 'items' }, 'Carregando…');
    modal('Mensagens — ' + p.title, box);
    const fill = async () => {
      const subs = await api('GET', '/api/pages/' + p.id + '/submissions');
      if (!subs.length) {
        box.replaceChildren(h('p', { class: 'hint' }, 'Nenhuma mensagem recebida. Adicione um bloco "Formulário de contato" e publique a página.'));
        return;
      }
      box.replaceChildren(...subs.map((s) => h('div', { class: 'submission' },
        h('header', null,
          h('div', null, h('strong', null, s.name), ' · ', h('a', { href: 'mailto:' + s.email }, s.email),
            h('div', { class: 'page-meta' }, formatDate(s.createdAt))),
          h('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => {
              await api('DELETE', '/api/pages/' + p.id + '/submissions/' + s.id);
              fill();
              load();
            },
          }, 'Excluir')),
        h('p', null, s.message))));
    };
    fill().catch((e) => box.replaceChildren(e.message));
  }

  document.getElementById('btn-new').addEventListener('click', openNew);
  search.addEventListener('input', render);
  load();
})();
