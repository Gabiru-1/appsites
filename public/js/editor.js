(function () {
  'use strict';
  const { h, api, toast } = window.UI;
  const PB = window.PageBlocks;
  const R = window.PageRenderer;

  const $ = (id) => document.getElementById(id);
  const pageId = new URLSearchParams(location.search).get('id');

  const state = {
    page: null,
    selectedId: null,
    dirty: false,
    saving: false,
    saveAgain: false,
    history: [],
    historyIndex: -1,
  };

  // ---------- Carregamento ----------

  async function init() {
    if (!pageId) {
      location.href = '/';
      return;
    }
    try {
      state.page = await api('GET', '/api/pages/' + encodeURIComponent(pageId));
    } catch (e) {
      document.body.replaceChildren(h('div', { class: 'empty-state', style: 'margin:40px' },
        h('h2', null, 'Não foi possível abrir a página'), h('p', null, e.message), h('a', { class: 'btn', href: '/' }, 'Voltar')));
      return;
    }
    $('title').value = state.page.title;
    $('export').href = '/api/pages/' + pageId + '/export';
    pushHistory(true);
    renderPalette();
    renderLayers();
    renderPageSettings();
    renderProps();
    renderPublish();
    setupCanvas();
    setSaveState('Salvo');
  }

  // ---------- Histórico (desfazer / refazer) ----------

  function snapshot() {
    const p = state.page;
    return JSON.stringify({ title: p.title, settings: p.settings, blocks: p.blocks });
  }

  let historyTimer;
  function pushHistory(immediate) {
    clearTimeout(historyTimer);
    const run = () => {
      const snap = snapshot();
      if (state.history[state.historyIndex] === snap) return;
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(snap);
      if (state.history.length > 100) state.history.shift();
      state.historyIndex = state.history.length - 1;
      updateUndoButtons();
    };
    if (immediate) run();
    else historyTimer = setTimeout(run, 400);
  }

  function restore(index) {
    clearTimeout(historyTimer);
    state.historyIndex = index;
    const snap = JSON.parse(state.history[index]);
    Object.assign(state.page, snap);
    $('title').value = state.page.title;
    if (state.selectedId && !findBlock(state.selectedId)) state.selectedId = null;
    updateUndoButtons();
    renderAll();
    markDirty();
  }

  function undo() {
    pushHistory(true);
    if (state.historyIndex > 0) restore(state.historyIndex - 1);
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) restore(state.historyIndex + 1);
  }

  function updateUndoButtons() {
    $('undo').disabled = state.historyIndex <= 0;
    $('redo').disabled = state.historyIndex >= state.history.length - 1;
  }

  // ---------- Alterações e salvamento ----------

  // content: mudou só o conteúdo (digitação) — não reconstruir o painel de propriedades
  function changed(opts) {
    opts = opts || {};
    markDirty();
    pushHistory(opts.immediate);
    updateCanvas();
    renderLayers();
    if (opts.props) renderProps();
  }

  let saveTimer;
  function markDirty() {
    state.dirty = true;
    setSaveState('Alterações não salvas', 'dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }

  function setSaveState(text, cls) {
    const el = $('save-state');
    el.textContent = text;
    el.className = 'save-state hide-sm' + (cls ? ' ' + cls : '');
  }

  async function save() {
    clearTimeout(saveTimer);
    if (state.saving) {
      state.saveAgain = true;
      return;
    }
    if (!state.dirty) return;
    state.saving = true;
    state.dirty = false;
    setSaveState('Salvando…');
    try {
      const p = state.page;
      const saved = await api('PUT', '/api/pages/' + pageId, { title: p.title, settings: p.settings, blocks: p.blocks });
      state.page.updatedAt = saved.updatedAt;
      if (!state.dirty) setSaveState('Salvo');
    } catch (e) {
      state.dirty = true;
      setSaveState('Erro ao salvar', 'error');
      toast('Erro ao salvar: ' + e.message, true);
    } finally {
      state.saving = false;
      if (state.saveAgain) {
        state.saveAgain = false;
        save();
      }
    }
  }

  async function togglePublish() {
    await save();
    try {
      const saved = await api('PUT', '/api/pages/' + pageId, { published: !state.page.published });
      state.page.published = saved.published;
      renderPublish();
      toast(saved.published ? 'Página publicada! 🎉' : 'Página despublicada');
    } catch (e) {
      toast(e.message, true);
    }
  }

  function renderPublish() {
    const p = state.page;
    const btn = $('publish');
    btn.textContent = p.published ? 'Despublicar' : 'Publicar';
    btn.classList.toggle('active', !p.published);
    const view = $('view');
    view.href = '/p/' + p.slug;
    view.hidden = !p.published;
  }

  // ---------- Blocos ----------

  function findBlock(id) {
    return state.page.blocks.find((b) => b.id === id) || null;
  }

  function indexOf(id) {
    return state.page.blocks.findIndex((b) => b.id === id);
  }

  function addBlock(type) {
    pushHistory(true);
    const block = PB.createBlock(type);
    const i = indexOf(state.selectedId);
    if (i >= 0) state.page.blocks.splice(i + 1, 0, block);
    else state.page.blocks.push(block);
    state.selectedId = block.id;
    changed({ immediate: true, props: true });
    scrollToBlock(block.id);
    showMobile('right');
  }

  function moveBlock(id, delta) {
    pushHistory(true);
    const blocks = state.page.blocks;
    const i = indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    blocks.splice(j, 0, blocks.splice(i, 1)[0]);
    changed({ immediate: true, props: true });
    scrollToBlock(id);
  }

  function moveBlockTo(id, targetIndex) {
    pushHistory(true);
    const blocks = state.page.blocks;
    const i = indexOf(id);
    if (i < 0) return;
    const [b] = blocks.splice(i, 1);
    blocks.splice(targetIndex > i ? targetIndex - 1 : targetIndex, 0, b);
    changed({ immediate: true, props: true });
  }

  function duplicateBlock(id) {
    pushHistory(true);
    const i = indexOf(id);
    if (i < 0) return;
    const copy = PB.clone(state.page.blocks[i]);
    copy.id = PB.uid();
    state.page.blocks.splice(i + 1, 0, copy);
    state.selectedId = copy.id;
    changed({ immediate: true, props: true });
    scrollToBlock(copy.id);
  }

  function removeBlock(id) {
    pushHistory(true);
    const i = indexOf(id);
    if (i < 0) return;
    state.page.blocks.splice(i, 1);
    const next = state.page.blocks[i] || state.page.blocks[i - 1];
    state.selectedId = next ? next.id : null;
    changed({ immediate: true, props: true });
  }

  function select(id) {
    state.selectedId = id;
    renderProps();
    renderLayers();
    markSelected();
  }

  function blockSummary(b) {
    const d = b.data || {};
    const text = d.title || d.text || d.name || d.label || d.content || d.caption || d.alt || '';
    return String(text).replace(/[*[\]()#]/g, '').slice(0, 40);
  }

  // ---------- Paleta ----------

  function renderPalette() {
    $('tab-add').replaceChildren(
      h('h3', null, 'Clique para adicionar'),
      h('div', { class: 'palette' }, Object.entries(PB.BLOCKS).map(([type, def]) =>
        h('button', { class: 'palette-item', title: 'Adicionar ' + def.label, onclick: () => addBlock(type) },
          h('span', { class: 'ico' }, def.icon), def.label))),
      h('p', { class: 'hint', style: 'padding:0' }, 'O bloco é inserido logo abaixo do bloco selecionado.'));
  }

  // ---------- Estrutura (camadas) ----------

  let dragId = null;
  function renderLayers() {
    const blocks = state.page.blocks;
    const panel = $('tab-layers');
    if (!blocks.length) {
      panel.replaceChildren(h('p', { class: 'hint' }, 'Nenhum bloco ainda. Use a aba "Adicionar".'));
      return;
    }
    panel.replaceChildren(
      h('h3', null, 'Arraste para reordenar'),
      h('div', { class: 'layers' }, blocks.map((b, i) => {
        const def = PB.BLOCKS[b.type];
        const el = h('div', {
          class: 'layer' + (b.id === state.selectedId ? ' selected' : ''),
          draggable: 'true',
          onclick: () => { select(b.id); scrollToBlock(b.id); },
          ondragstart: (e) => { dragId = b.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); },
          ondragover: (e) => { e.preventDefault(); el.classList.add('drag-over'); },
          ondragleave: () => el.classList.remove('drag-over'),
          ondrop: (e) => { e.preventDefault(); el.classList.remove('drag-over'); if (dragId && dragId !== b.id) moveBlockTo(dragId, i); dragId = null; },
        },
          h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
          h('span', { class: 'ico' }, def.icon),
          h('span', { class: 'name' }, def.label, ' ', h('small', null, blockSummary(b))),
          h('button', { class: 'btn-icon', title: 'Mover para cima', disabled: i === 0, onclick: (e) => { e.stopPropagation(); moveBlock(b.id, -1); } }, '↑'),
          h('button', { class: 'btn-icon', title: 'Mover para baixo', disabled: i === blocks.length - 1, onclick: (e) => { e.stopPropagation(); moveBlock(b.id, 1); } }, '↓'));
        return el;
      })),
      // área de soltar no final
      h('div', {
        class: 'hint', style: 'padding:10px;border:1px dashed #d1d5db;border-radius:8px',
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); if (dragId) moveBlockTo(dragId, blocks.length); dragId = null; },
      }, 'Soltar no final'));
  }

  // ---------- Campos do formulário ----------

  function buildField(field, get, set, onStructure) {
    const value = get();
    const label = h('span', null, field.label);
    const help = field.help ? h('small', null, field.help) : null;

    switch (field.type) {
      case 'textarea':
        return h('label', { class: 'field' }, label,
          h('textarea', { rows: String(field.rows || 3), value: value == null ? '' : value, oninput: (e) => set(e.target.value) }), help);

      case 'select':
        return h('label', { class: 'field' }, label,
          h('select', { onchange: (e) => set(e.target.value) },
            field.options.map((o) => h('option', { value: o.value, selected: String(value) === String(o.value) }, o.label))), help);

      case 'checkbox':
        return h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: Boolean(value), onchange: (e) => set(e.target.checked) }), field.label);

      case 'number': {
        const out = h('output', null, value);
        return h('label', { class: 'field' }, label,
          h('div', { class: 'range-row' },
            h('input', {
              type: 'range', min: String(field.min), max: String(field.max), step: String(field.step || 1), value: String(value),
              oninput: (e) => { out.textContent = e.target.value; set(Number(e.target.value)); },
            }), out), help);
      }

      case 'color': {
        const text = h('input', { type: 'text', value: value || '', placeholder: 'Padrão do tema' });
        const picker = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000', title: 'Escolher cor' });
        picker.addEventListener('input', () => { text.value = picker.value; set(picker.value); });
        text.addEventListener('input', () => {
          const v = text.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
          if (!v || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) set(v);
        });
        return h('div', { class: 'field' }, label,
          h('div', { class: 'color-row' }, picker, text,
            h('button', { class: 'btn btn-sm btn-icon', title: 'Usar cor padrão', type: 'button', onclick: () => { text.value = ''; set(''); } }, '✕')), help);
      }

      case 'image': {
        const preview = h('img', { class: 'img-preview', alt: '', src: value || '', hidden: !value });
        preview.addEventListener('error', () => { preview.hidden = true; });
        preview.addEventListener('load', () => { preview.hidden = false; });
        return h('label', { class: 'field' }, label,
          h('input', {
            type: 'url', value: value || '', placeholder: 'https://…',
            oninput: (e) => { const v = e.target.value.trim(); set(v); preview.hidden = !v; if (v) preview.src = v; },
          }), preview, help);
      }

      case 'items':
        return buildItems(field, get, set, onStructure);

      case 'url':
      case 'text':
      default:
        return h('label', { class: 'field' }, label,
          h('input', {
            type: field.type === 'url' ? 'url' : 'text',
            value: value == null ? '' : value,
            placeholder: field.type === 'url' ? 'https://… ou #secao' : '',
            oninput: (e) => set(e.target.value),
          }), help);
    }
  }

  const openItems = new Set();
  function buildItems(field, get, set, onStructure) {
    const items = Array.isArray(get()) ? get() : [];
    const update = (next, structural) => {
      if (structural) pushHistory(true);
      set(next);
      if (structural) onStructure();
    };
    const list = h('div', { class: 'items' }, items.map((item, i) => {
      const key = field.key + ':' + i;
      const open = openItems.has(key);
      const title = item.title || item.label || item.alt || field.itemLabel + ' ' + (i + 1);
      return h('div', { class: 'item' },
        h('div', { class: 'item-head', onclick: () => { open ? openItems.delete(key) : openItems.add(key); onStructure(); } },
          h('span', null, open ? '▾' : '▸'),
          h('strong', null, title),
          h('button', { class: 'btn btn-sm btn-icon', type: 'button', title: 'Subir', disabled: i === 0, onclick: (e) => { e.stopPropagation(); const n = items.slice(); n.splice(i - 1, 0, n.splice(i, 1)[0]); update(n, true); } }, '↑'),
          h('button', { class: 'btn btn-sm btn-icon', type: 'button', title: 'Descer', disabled: i === items.length - 1, onclick: (e) => { e.stopPropagation(); const n = items.slice(); n.splice(i + 1, 0, n.splice(i, 1)[0]); update(n, true); } }, '↓'),
          h('button', { class: 'btn btn-sm btn-icon btn-danger', type: 'button', title: 'Remover', onclick: (e) => { e.stopPropagation(); update(items.filter((_, j) => j !== i), true); } }, '✕')),
        open ? h('div', { class: 'item-body' }, field.fields.map((sub) =>
          buildField(sub, () => item[sub.key], (v) => {
            const n = items.slice();
            n[i] = Object.assign({}, n[i], { [sub.key]: v });
            items[i] = n[i];
            update(n, false);
          }, onStructure))) : null);
    }));
    return h('div', { class: 'field' },
      h('span', null, field.label),
      list,
      h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => { openItems.add(field.key + ':' + items.length); update(items.concat([PB.clone(field.itemDefaults)]), true); },
      }, '+ Adicionar ' + field.itemLabel.toLowerCase()));
  }

  // ---------- Painel de propriedades ----------

  let propsBlockId = null;
  function renderProps() {
    const panel = $('props');
    const block = findBlock(state.selectedId);
    if (propsBlockId !== state.selectedId) openItems.clear();
    propsBlockId = state.selectedId;
    if (!block) {
      panel.replaceChildren(h('p', { class: 'hint' }, 'Clique em um bloco na pré-visualização para editá-lo.'));
      return;
    }
    const def = PB.BLOCKS[block.type];
    const scrollTop = panel.scrollTop;
    panel.replaceChildren(
      h('h3', null, def.icon + '  ' + def.label),
      h('div', { class: 'block-actions' },
        h('button', { class: 'btn btn-sm', onclick: () => moveBlock(block.id, -1), disabled: indexOf(block.id) === 0 }, '↑ Subir'),
        h('button', { class: 'btn btn-sm', onclick: () => moveBlock(block.id, 1), disabled: indexOf(block.id) === state.page.blocks.length - 1 }, '↓ Descer'),
        h('button', { class: 'btn btn-sm', onclick: () => duplicateBlock(block.id) }, 'Duplicar'),
        h('button', { class: 'btn btn-sm btn-danger', onclick: () => removeBlock(block.id) }, 'Excluir')),
      ...def.fields.map((field) => buildField(
        field,
        () => (field.key in block.data ? block.data[field.key] : def.defaults[field.key]),
        (v) => { block.data[field.key] = v; changed(); },
        () => { changed({ immediate: true, props: true }); })));
    panel.scrollTop = scrollTop;
  }

  // ---------- Configurações da página ----------

  function renderPageSettings() {
    const p = state.page;
    const slugInput = h('input', { type: 'text', value: p.slug, maxlength: '60' });
    slugInput.addEventListener('change', async () => {
      try {
        await save();
        const saved = await api('PUT', '/api/pages/' + pageId, { slug: slugInput.value });
        p.slug = saved.slug;
        slugInput.value = saved.slug;
        renderPublish();
        toast('Endereço atualizado');
      } catch (e) {
        slugInput.value = p.slug;
        toast(e.message, true);
      }
    });
    $('tab-page').replaceChildren(
      h('h3', null, 'Configurações da página'),
      h('label', { class: 'field' }, h('span', null, 'Endereço'),
        h('div', { class: 'slug-row' }, h('span', null, '/p/'), slugInput),
        h('small', null, 'Letras minúsculas, números e hífens.')),
      ...PB.SETTINGS_FIELDS.map((field) => buildField(
        field,
        () => p.settings[field.key],
        (v) => { p.settings[field.key] = v; changed(); },
        () => {})));
  }

  // ---------- Pré-visualização ----------

  let lastHead = '';
  function setupCanvas() {
    const frame = $('frame');
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      lastHead = doc.head.innerHTML;
      doc.addEventListener('click', (e) => {
        if (e.target.closest('a,button')) e.preventDefault();
        const el = e.target.closest('[data-block-id]');
        if (el) {
          select(el.dataset.blockId);
          showMobile('right');
        }
      }, true);
      doc.addEventListener('submit', (e) => e.preventDefault(), true);
      doc.addEventListener('keydown', onKeyDown);
      markSelected();
    });
    frame.srcdoc = R.renderPage(state.page, { editor: true });
  }

  let rafId;
  function updateCanvas() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const doc = $('frame').contentDocument;
      if (!doc || !doc.body) return;
      const parts = R.renderParts(state.page, { editor: true });
      if (parts.head !== lastHead) {
        doc.head.innerHTML = parts.head;
        lastHead = parts.head;
      }
      doc.body.innerHTML = parts.body;
      markSelected();
    });
  }

  function markSelected() {
    const doc = $('frame').contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-block-id]').forEach((el) => {
      const on = el.dataset.blockId === state.selectedId;
      el.classList.toggle('pb-selected', on);
      if (on) {
        const b = findBlock(el.dataset.blockId);
        el.dataset.label = b ? PB.BLOCKS[b.type].label : '';
      }
    });
  }

  function scrollToBlock(id) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const doc = $('frame').contentDocument;
      const el = doc && doc.querySelector('[data-block-id="' + CSS.escape(id) + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  }

  // ---------- Renderização geral / navegação ----------

  function renderAll() {
    renderLayers();
    renderPageSettings();
    renderProps();
    updateCanvas();
  }

  function showMobile(which) {
    const map = { left: 'left', canvas: 'canvas-wrap', right: 'right' };
    ['left', 'canvas-wrap', 'right'].forEach((id) => $(id).classList.toggle('show', id === map[which]));
    document.querySelectorAll('.mobile-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.show === which));
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      return;
    }
    if (isTyping(e)) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      e.preventDefault();
      removeBlock(state.selectedId);
    } else if (e.key === 'Escape') {
      select(null);
    }
  }

  // ---------- Eventos ----------

  document.querySelectorAll('.sidebar .tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar .tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      ['add', 'layers', 'page'].forEach((name) => { $('tab-' + name).hidden = name !== tab.dataset.tab; });
    });
  });

  document.querySelectorAll('[data-device]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-device]').forEach((b) => b.classList.toggle('active', b === btn));
      $('canvas').className = 'canvas ' + btn.dataset.device;
    });
  });

  document.querySelectorAll('.mobile-tabs .tab').forEach((t) => t.addEventListener('click', () => showMobile(t.dataset.show)));

  $('title').addEventListener('input', (e) => {
    state.page.title = e.target.value;
    document.title = (e.target.value || 'Sem título') + ' — Editor';
    changed();
  });
  $('save').addEventListener('click', save);
  $('publish').addEventListener('click', togglePublish);
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty || state.saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  init();
})();
