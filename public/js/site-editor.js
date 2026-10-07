/* Editor de sites feitos com modelos HTML: formulário de dados + prévia ao vivo. */
(function () {
  'use strict';
  const { h, api, toast, modal, copyText } = window.UI;
  const $ = (id) => document.getElementById(id);
  const pageId = new URLSearchParams(location.search).get('id');

  let page = null;
  let lead = null;
  let dirty = false;
  let saving = false;

  const SIMPLE = [
    ['Textos principais', [
      ['titulo', 'Título principal'], ['subtitulo', 'Subtítulo', 'textarea'], ['sobre', 'Sobre o negócio', 'textarea', 6], ['cta', 'Texto do botão'],
    ]],
    ['Negócio', [
      ['nome', 'Nome'], ['categoria', 'Segmento'], ['cidade', 'Cidade'], ['corPrincipal', 'Cor principal', 'color'],
    ]],
    ['Contato', [
      ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp (só números, com 55 + DDD)'], ['email', 'E-mail'], ['instagram', 'Instagram (link)'],
      ['endereco', 'Endereço', 'textarea'], ['mapsUrl', 'Link do Google Maps'], ['mapsEmbed', 'URL do mapa incorporado'],
    ]],
    ['Google', [['avaliacao', 'Nota (ex.: 4,8)'], ['totalAvaliacoes', 'Quantidade de avaliações']]],
  ];

  const LISTS = [
    ['servicos', 'Serviços', 'Serviço', [['icone', 'Emoji'], ['titulo', 'Título'], ['texto', 'Descrição', 'textarea']], { icone: '✨', titulo: 'Novo serviço', texto: '' }],
    ['avaliacoes', 'Avaliações', 'Avaliação', [['autor', 'Autor'], ['nota', 'Nota (1-5)'], ['texto', 'Texto', 'textarea']], { autor: 'Cliente', nota: 5, texto: '' }],
    ['horarios', 'Horários', 'Dia', [['dia', 'Dia'], ['horas', 'Horário']], { dia: '', horas: '' }],
  ];

  async function init() {
    if (!pageId) return (location.href = '/#/sites');
    try {
      page = await api('GET', '/api/pages/' + encodeURIComponent(pageId));
    } catch (e) {
      document.body.replaceChildren(h('div', { class: 'empty-state', style: 'margin:40px' }, h('h2', null, 'Não foi possível abrir o site'), h('p', null, e.message)));
      return;
    }
    if (page.kind !== 'html') return (location.href = '/editor?id=' + page.id);
    page.siteData = page.siteData || {};
    if (page.leadId) lead = await api('GET', '/api/leads/' + page.leadId).catch(() => null);
    $('title').value = page.title;
    document.title = page.title + ' — Editar site';
    const { models } = await api('GET', '/api/models');
    $('model').replaceChildren(...models.filter((m) => m.kind === 'html').map((m) => h('option', { value: m.id, selected: m.id === page.templateId }, 'Modelo: ' + m.name)));
    renderForm();
    renderPublish();
    preview();
    setState('Salvo');
  }

  function field(label, input, help) {
    return h('label', { class: 'field' }, h('span', null, label), input, help ? h('small', null, help) : null);
  }

  function input(obj, key, type, rows, onChange) {
    const set = (v) => {
      obj[key] = key === 'nota' || key === 'totalAvaliacoes' ? Number(v) || 0 : v;
      onChange ? onChange() : changed();
    };
    if (type === 'textarea') {
      const el = h('textarea', { rows: String(rows || 3), oninput: (e) => set(e.target.value) });
      el.value = obj[key] || '';
      return el;
    }
    if (type === 'color') {
      const text = h('input', { type: 'text', value: obj[key] || '', placeholder: 'Padrão do modelo' });
      const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : '#2563eb' });
      pick.addEventListener('input', () => { text.value = pick.value; set(pick.value); });
      text.addEventListener('input', () => { if (!text.value || /^#[0-9a-f]{6}$/i.test(text.value)) set(text.value); });
      return h('div', { class: 'color-row' }, pick, text);
    }
    return h('input', { type: 'text', value: obj[key] == null ? '' : String(obj[key]), oninput: (e) => set(e.target.value) });
  }

  function renderForm() {
    const d = page.siteData;
    const groups = SIMPLE.map(([title, fields]) => h('details', { class: 'form-group', open: title === 'Textos principais' },
      h('summary', null, title),
      ...fields.map(([key, label, type, rows]) => field(label, input(d, key, type, rows)))));

    // Fotos
    d.fotos = d.fotos || [];
    const photosBox = h('div', { class: 'items' });
    const renderPhotos = () => {
      photosBox.replaceChildren(...d.fotos.map((url, i) => h('div', { class: 'photo-row' },
        h('img', { src: url, alt: '' }),
        h('span', { class: 'small muted' }, 'Foto ' + (i + 1) + (i === 0 ? ' (principal)' : '')),
        h('button', { class: 'btn btn-sm btn-icon', type: 'button', title: 'Subir', disabled: i === 0, onclick: () => { d.fotos.splice(i - 1, 0, d.fotos.splice(i, 1)[0]); renderPhotos(); changed(); } }, '↑'),
        h('button', { class: 'btn btn-sm btn-icon btn-danger', type: 'button', title: 'Remover', onclick: () => { d.fotos.splice(i, 1); renderPhotos(); changed(); } }, '✕'))));
      const unused = lead ? (lead.photos || []).filter((p) => !d.fotos.includes(p.url)) : [];
      if (unused.length) {
        photosBox.append(h('div', { class: 'small muted' }, 'Fotos do lead que não estão no site:'),
          h('div', { class: 'photo-pick' }, unused.map((p) => h('button', {
            type: 'button', title: 'Adicionar', onclick: () => { d.fotos.push(p.url); renderPhotos(); changed(); },
          }, h('img', { src: p.url, alt: 'Adicionar ' + p.name })))));
      }
      const urlInput = h('input', { type: 'url', placeholder: 'https://… (adicionar foto por link)' });
      photosBox.append(h('div', { class: 'row-gap' }, urlInput, h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => { if (urlInput.value.trim()) { d.fotos.push(urlInput.value.trim()); renderPhotos(); changed(); } },
      }, '+ Adicionar')));
    };
    renderPhotos();

    const lists = LISTS.map(([key, title, itemLabel, fields, defaults]) => {
      d[key] = d[key] || [];
      const box = h('div', { class: 'items' });
      const render = () => {
        box.replaceChildren(...d[key].map((item, i) => h('div', { class: 'item' },
          h('div', { class: 'item-head' },
            h('strong', null, item.titulo || item.autor || item.dia || itemLabel + ' ' + (i + 1)),
            h('button', { class: 'btn btn-sm btn-icon btn-danger', type: 'button', title: 'Remover', onclick: () => { d[key].splice(i, 1); render(); changed(); } }, '✕')),
          h('div', { class: 'item-body' }, fields.map(([k, label, type]) => field(label, input(item, k, type)))))),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { d[key].push(Object.assign({}, defaults)); render(); changed(); } }, '+ Adicionar ' + itemLabel.toLowerCase()));
      };
      render();
      return h('details', { class: 'form-group' }, h('summary', null, title + ' (' + d[key].length + ')'), box);
    });

    const slug = h('input', { type: 'text', value: page.slug });
    slug.addEventListener('change', async () => {
      try {
        await save();
        const r = await api('PUT', '/api/pages/' + page.id, { slug: slug.value });
        page.slug = r.slug;
        slug.value = r.slug;
        renderPublish();
        toast('Endereço atualizado');
      } catch (e) {
        slug.value = page.slug;
        toast(e.message, true);
      }
    });

    $('form').replaceChildren(
      ...groups,
      h('details', { class: 'form-group', open: true }, h('summary', null, 'Fotos (' + d.fotos.length + ')'), photosBox),
      ...lists,
      h('details', { class: 'form-group' }, h('summary', null, 'Endereço do site'),
        h('div', { class: 'slug-row' }, h('span', null, '/p/'), slug)));
  }

  // ---------- prévia ----------

  let previewTimer;
  async function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: page.templateId, siteData: page.siteData }),
        });
        const html = await res.text();
        const frame = $('frame');
        const y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
        frame.onload = () => {
          frame.contentWindow.scrollTo(0, y);
          // Na prévia, links não navegam
          frame.contentDocument.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); }, true);
        };
        frame.srcdoc = html;
      } catch (e) {
        toast('Erro na prévia: ' + e.message, true);
      }
    }, 250);
  }

  // ---------- salvar ----------

  let saveTimer;
  function changed() {
    dirty = true;
    setState('Alterações não salvas', 'dirty');
    preview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }

  function setState(text, cls) {
    $('save-state').textContent = text;
    $('save-state').className = 'save-state hide-sm' + (cls ? ' ' + cls : '');
  }

  async function save() {
    clearTimeout(saveTimer);
    if (saving || !dirty) return;
    saving = true;
    dirty = false;
    setState('Salvando…');
    try {
      await api('PUT', '/api/pages/' + page.id, { title: page.title, siteData: page.siteData, templateId: page.templateId });
      if (!dirty) setState('Salvo');
    } catch (e) {
      dirty = true;
      setState('Erro ao salvar', 'error');
      toast(e.message, true);
    } finally {
      saving = false;
      if (dirty) saveTimer = setTimeout(save, 1500);
    }
  }

  function renderPublish() {
    $('publish').textContent = page.published ? 'Despublicar' : 'Publicar';
    $('publish').classList.toggle('active', !page.published);
    $('view').href = '/p/' + page.slug;
    $('view').hidden = !page.published;
  }

  // ---------- eventos ----------

  $('title').addEventListener('input', (e) => { page.title = e.target.value; changed(); });
  $('model').addEventListener('change', (e) => { page.templateId = e.target.value; changed(); });
  $('save').addEventListener('click', save);
  $('publish').addEventListener('click', async () => {
    await save();
    const r = await api('PUT', '/api/pages/' + page.id, { published: !page.published });
    page.published = r.published;
    renderPublish();
    toast(page.published ? 'Publicado em /p/' + page.slug : 'Despublicado');
  });
  $('vercel').addEventListener('click', async (e) => {
    await save();
    e.target.disabled = true;
    e.target.textContent = 'Publicando…';
    try {
      const r = await api('POST', '/api/pages/' + page.id + '/vercel');
      modal('Publicado na Vercel 🎉', [h('p', null, h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.url))],
        [h('button', { class: 'btn btn-primary', onclick: () => copyText(r.url).then(() => toast('Link copiado')) }, '⧉ Copiar link')]);
    } catch (err) {
      toast(err.message, true);
    }
    e.target.disabled = false;
    e.target.textContent = '▲ Vercel';
  });
  $('ai').addEventListener('click', () => {
    const extra = h('input', { type: 'text', placeholder: 'Ex.: destacar o atendimento infantil' });
    const close = modal('Reescrever textos com IA', [
      h('p', { class: 'muted' }, 'A IA reescreve título, subtítulo, "sobre", serviços e o texto do botão com base nos dados e nas avaliações.'),
      field('Instruções (opcional)', extra),
    ], [h('button', {
      class: 'btn btn-primary',
      onclick: async (ev) => {
        ev.target.disabled = true;
        ev.target.textContent = 'Escrevendo…';
        try {
          const copy = await api('POST', '/api/ai/copy', { siteData: page.siteData, instructions: extra.value });
          Object.assign(page.siteData, copy);
          close();
          renderForm();
          changed();
          toast('Textos atualizados ✨');
        } catch (err) {
          toast(err.message, true);
          ev.target.disabled = false;
          ev.target.textContent = 'Gerar';
        }
      },
    }, 'Gerar')]);
  });
  document.querySelectorAll('[data-device]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-device]').forEach((b) => b.classList.toggle('active', b === btn));
    $('canvas').className = 'canvas ' + btn.dataset.device;
  }));
  document.querySelectorAll('.mobile-tabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.mobile-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    $('left').classList.toggle('show', t.dataset.show === 'left');
    $('canvas-wrap').classList.toggle('show', t.dataset.show === 'canvas');
  }));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty || saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  init();
})();
