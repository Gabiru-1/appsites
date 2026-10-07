/* Criar site, Meus sites e Modelos. */
(function () {
  'use strict';
  const { h, api, toast, modal, formatDate, copyText } = window.UI;
  const App = window.App;

  const editUrl = (p) => (p.kind === 'html' ? '/site?id=' : '/editor?id=') + encodeURIComponent(p.id);

  function previewFrame(src, cls) {
    return h('div', { class: 'preview-thumb ' + (cls || '') }, h('iframe', { src, loading: 'lazy', tabindex: '-1', title: 'Pré-visualização', sandbox: 'allow-same-origin' }));
  }

  function openPreview(title, src) {
    modal(title, h('div', { class: 'preview-large' }, h('iframe', { src, title })));
    document.querySelector('.modal').classList.add('modal-wide');
  }

  // ---------- Criar site ----------

  App.views.criar = async function (ctx) {
    const [leadsList, models] = await Promise.all([api('GET', '/api/leads'), api('GET', '/api/models')]);
    let source = ctx.query.get('lead') ? 'lead' : leadsList.length ? 'lead' : 'prompt';
    let modelId = 'blocks:classico';

    const leadSelect = h('select', { class: 'input' },
      h('option', { value: '' }, 'Escolha um lead…'),
      leadsList.map((l) => h('option', { value: l.id, selected: l.id === ctx.query.get('lead') }, l.nome + (l.cidade ? ' — ' + l.cidade : '') + (l.siteId ? ' (já tem site)' : ''))));
    const promptBox = h('textarea', { class: 'input', rows: '8', placeholder: 'Cole aqui o prompt copiado na aba Prompt do lead…' });
    const title = h('input', { class: 'input', type: 'text', placeholder: 'Nome do site (opcional)' });
    const useAi = h('input', { type: 'checkbox', disabled: !App.settings.hasAnthropic });
    const aiExtra = h('input', { class: 'input', type: 'text', placeholder: 'Instruções para a IA (opcional). Ex.: destacar o delivery e o rodízio' });
    const parsed = h('div', { class: 'small muted' });

    const sourceBody = h('div');
    function renderSource() {
      document.querySelectorAll('[data-source]').forEach((b) => b.classList.toggle('active', b.dataset.source === source));
      sourceBody.replaceChildren(source === 'lead'
        ? h('label', { class: 'field' }, h('span', null, 'Lead'), leadSelect,
          !leadsList.length ? h('small', null, 'Nenhum lead salvo. Use Prospectar primeiro.') : null)
        : h('label', { class: 'field' }, h('span', null, 'Prompt'), promptBox, parsed));
    }
    promptBox.addEventListener('input', debounce(async () => {
      if (!promptBox.value.trim()) return parsed.replaceChildren();
      try {
        const r = await api('POST', '/api/sitedata/parse', { prompt: promptBox.value });
        parsed.replaceChildren('✓ Dados reconhecidos: ' + r.siteData.nome + ' · ' + r.siteData.fotos.length + ' fotos · ' + r.siteData.avaliacoes.length + ' avaliações');
        if (!title.value) title.placeholder = r.siteData.nome;
      } catch (e) {
        parsed.replaceChildren(h('span', { class: 'error-text' }, e.message));
      }
    }, 400));

    const modelGrid = h('div', { class: 'model-grid' }, models.models.map((m) =>
      h('div', {
        class: 'model-card' + (m.id === modelId ? ' selected' : ''),
        'data-id': m.id,
        tabindex: '0',
        role: 'radio',
        'aria-checked': String(m.id === modelId),
        onclick: () => pick(m.id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(m.id); } },
      },
        previewFrame('/api/models/' + encodeURIComponent(m.id) + '/preview'),
        h('div', { class: 'model-info' },
          h('div', null, h('strong', null, m.name), h('span', { class: 'tag' }, m.kind === 'html' ? 'HTML' : 'Editável')),
          h('p', { class: 'muted small' }, m.description),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => { e.stopPropagation(); openPreview(m.name, '/api/models/' + encodeURIComponent(m.id) + '/preview'); } }, 'Ver maior')))));

    function pick(id) {
      modelId = id;
      modelGrid.querySelectorAll('.model-card').forEach((c) => {
        c.classList.toggle('selected', c.dataset.id === id);
        c.setAttribute('aria-checked', String(c.dataset.id === id));
      });
    }

    const createBtn = h('button', {
      class: 'btn btn-primary btn-lg',
      onclick: async () => {
        const body = { modelId, title: title.value, useAi: useAi.checked, aiInstructions: aiExtra.value };
        if (source === 'lead') {
          if (!leadSelect.value) return toast('Escolha um lead', true);
          body.leadId = leadSelect.value;
        } else {
          if (!promptBox.value.trim()) return toast('Cole o prompt', true);
          body.prompt = promptBox.value;
        }
        createBtn.disabled = true;
        createBtn.textContent = useAi.checked ? 'A IA está escrevendo os textos…' : 'Criando…';
        try {
          const page = await api('POST', '/api/pages', body);
          location.href = editUrl(page);
        } catch (e) {
          toast(e.message, true);
          createBtn.disabled = false;
          createBtn.textContent = 'Criar site';
        }
      },
    }, 'Criar site');

    const view = h('div', null,
      App.header('Criar site', 'Escolha os dados do negócio e um modelo. O site é montado automaticamente.'),
      h('section', { class: 'card step' },
        h('h2', { class: 'card-title' }, h('span', { class: 'step-n' }, '1'), 'Dados do negócio'),
        h('div', { class: 'seg' },
          h('button', { class: 'seg-btn', 'data-source': 'lead', onclick: () => { source = 'lead'; renderSource(); } }, 'Lead salvo'),
          h('button', { class: 'seg-btn', 'data-source': 'prompt', onclick: () => { source = 'prompt'; renderSource(); } }, 'Colar prompt')),
        sourceBody),
      h('section', { class: 'card step' },
        h('h2', { class: 'card-title' }, h('span', { class: 'step-n' }, '2'), 'Modelo'),
        modelGrid),
      h('section', { class: 'card step' },
        h('h2', { class: 'card-title' }, h('span', { class: 'step-n' }, '3'), 'Finalizar'),
        h('label', { class: 'field' }, h('span', null, 'Nome do site'), title),
        h('label', { class: 'check' }, useAi, 'Usar IA (Claude) para escrever título, textos e serviços'),
        App.settings.hasAnthropic ? aiExtra : h('p', { class: 'muted small' }, 'Para usar a IA, ', h('a', { href: '#/config' }, 'configure sua chave da Anthropic'), '.'),
        h('div', null, createBtn)));
    requestAnimationFrame(renderSource);
    return view;
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // ---------- Meus sites ----------

  App.views.sites = async function () {
    const list = await api('GET', '/api/pages');
    const grid = h('div', { class: 'page-grid' });

    function fill() {
      grid.replaceChildren(...list.map(card));
    }

    function card(p) {
      const live = p.published ? location.origin + '/p/' + p.slug : '';
      const vercelUrl = p.vercel && p.vercel.url;
      return h('article', { class: 'page-card' },
        h('a', { class: 'page-thumb', href: editUrl(p), 'aria-label': 'Editar ' + p.title }, h('iframe', { src: '/api/pages/' + p.id + '/preview', loading: 'lazy', tabindex: '-1', title: '' })),
        h('div', { class: 'page-body' },
          h('h3', { class: 'page-title' }, p.title),
          h('div', { class: 'page-meta' },
            h('span', { class: 'badge ' + (p.published ? 'badge-live' : 'badge-draft') }, p.published ? 'Publicado' : 'Rascunho'),
            vercelUrl ? h('span', { class: 'badge badge-vercel' }, '▲ Vercel') : null,
            h('span', null, p.kind === 'html' ? 'Modelo HTML' : p.blockCount + ' blocos')),
          live ? h('div', { class: 'page-meta' }, h('a', { href: live, target: '_blank', rel: 'noopener' }, '/p/' + p.slug + ' ↗')) : null,
          vercelUrl ? h('div', { class: 'page-meta' }, h('a', { href: vercelUrl, target: '_blank', rel: 'noopener' }, vercelUrl.replace('https://', '') + ' ↗')) : null,
          h('div', { class: 'page-meta' }, 'Editado em ' + formatDate(p.updatedAt))),
        h('div', { class: 'page-actions' },
          h('a', { class: 'btn btn-primary btn-sm', href: editUrl(p) }, 'Editar'),
          h('button', {
            class: 'btn btn-sm',
            onclick: async () => {
              try {
                const r = await api('PUT', '/api/pages/' + p.id, { published: !p.published });
                p.published = r.published;
                fill();
                toast(p.published ? 'Publicado em /p/' + p.slug : 'Despublicado');
              } catch (e) {
                toast(e.message, true);
              }
            },
          }, p.published ? 'Despublicar' : 'Publicar'),
          h('button', { class: 'btn btn-sm', onclick: (e) => deployVercel(p, e.target, fill) }, vercelUrl ? '▲ Atualizar Vercel' : '▲ Publicar na Vercel'),
          (live || vercelUrl) ? h('button', { class: 'btn btn-sm', onclick: () => copyText(vercelUrl || live).then(() => toast('Link copiado')) }, '⧉ Link') : null,
          h('a', { class: 'btn btn-sm', href: '/api/pages/' + p.id + '/export' }, 'Exportar'),
          h('button', { class: 'btn btn-sm', onclick: () => openSubmissions(p) }, 'Mensagens (' + p.submissionCount + ')'),
          h('button', {
            class: 'btn btn-sm',
            onclick: async () => {
              const copy = await api('POST', '/api/pages/' + p.id + '/duplicate');
              list.unshift(Object.assign({}, p, copy, { submissionCount: 0, blockCount: (copy.blocks || []).length }));
              fill();
              toast('Site duplicado');
            },
          }, 'Duplicar'),
          h('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => {
              if (!confirm('Excluir o site "' + p.title + '"?')) return;
              await api('DELETE', '/api/pages/' + p.id);
              list.splice(list.indexOf(p), 1);
              fill();
            },
          }, 'Excluir')));
    }

    fill();
    return h('div', null,
      App.header('Meus sites', 'Edite, publique e acompanhe os sites que você criou.', [
        h('button', { class: 'btn', onclick: newBlankPage }, '+ Página em branco'),
        h('a', { class: 'btn btn-primary', href: '#/criar' }, '✚ Criar site'),
      ]),
      list.length ? grid : App.empty('Nenhum site ainda', 'Crie um site a partir de um lead ou de um prompt.', h('a', { class: 'btn btn-primary', href: '#/criar' }, 'Criar site')));
  };

  async function deployVercel(p, btn, refresh) {
    if (!App.settings.hasVercel) {
      toast('Configure seu token da Vercel em Configurações', true);
      return App.go('#/config');
    }
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Publicando…';
    try {
      p.vercel = await api('POST', '/api/pages/' + p.id + '/vercel');
      refresh();
      modal('Publicado na Vercel 🎉', [
        h('p', null, 'Seu site está no ar (pode levar alguns segundos para ficar disponível):'),
        h('p', null, h('a', { href: p.vercel.url, target: '_blank', rel: 'noopener', class: 'strong' }, p.vercel.url)),
        h('p', { class: 'muted small' }, 'Para usar um domínio próprio (ex.: www.cliente.com.br), adicione-o no painel da Vercel, no projeto criado.'),
      ], [h('button', { class: 'btn btn-primary', onclick: () => copyText(p.vercel.url).then(() => toast('Link copiado')) }, '⧉ Copiar link')]);
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function newBlankPage() {
    const { pageTemplates } = await api('GET', '/api/models');
    let selected = 'blank';
    const title = h('input', { type: 'text', placeholder: 'Ex.: Promoção de Natal', maxlength: '120' });
    const opts = pageTemplates.map((t) => h('button', {
      type: 'button',
      class: 'template-opt' + (t.id === selected ? ' selected' : ''),
      'data-id': t.id,
      onclick: (e) => {
        selected = t.id;
        e.currentTarget.parentNode.querySelectorAll('.template-opt').forEach((b) => b.classList.toggle('selected', b.dataset.id === t.id));
      },
    }, h('strong', null, t.label), h('span', null, t.description)));
    modal('Nova página', [
      h('label', { class: 'field' }, h('span', null, 'Nome da página'), title),
      h('div', { class: 'field' }, h('span', null, 'Começar com'), h('div', { class: 'template-grid' }, opts)),
    ], [h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        try {
          const page = await api('POST', '/api/pages', { title: title.value, template: selected });
          location.href = editUrl(page);
        } catch (e) {
          toast(e.message, true);
        }
      },
    }, 'Criar e editar')]);
  }

  async function openSubmissions(p) {
    const box = h('div', { class: 'items' }, 'Carregando…');
    modal('Mensagens — ' + p.title, box);
    const fill = async () => {
      const subs = await api('GET', '/api/pages/' + p.id + '/submissions');
      if (!subs.length) {
        box.replaceChildren(h('p', { class: 'hint' }, 'Nenhuma mensagem recebida. Sites com o bloco "Formulário de contato" recebem mensagens aqui.'));
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
            },
          }, 'Excluir')),
        h('p', null, s.message))));
    };
    fill().catch((e) => box.replaceChildren(e.message));
  }

  // ---------- Modelos ----------

  App.views.modelos = async function () {
    const data = await api('GET', '/api/models');
    const vars = h('details', { class: 'card' },
      h('summary', { class: 'strong' }, 'Como criar um modelo HTML (variáveis disponíveis)'),
      h('p', { class: 'muted' }, 'Crie seu site em HTML normalmente e coloque as variáveis abaixo onde os dados do cliente devem entrar. Ex.: ',
        h('code', null, '<h1>{{titulo}}</h1>'), ', ', h('code', null, '<img src="{{foto_1}}">'), '. Use CSS e fontes à vontade; o arquivo inteiro vira o site.'),
      h('table', { class: 'table table-compact' },
        h('thead', null, h('tr', null, h('th', null, 'Variável'), h('th', null, 'O que é'))),
        h('tbody', null, data.variables.map(([k, v]) => h('tr', null, h('td', null, h('code', null, '{{' + k + '}}')), h('td', null, v))))),
      h('p', { class: 'muted small' }, 'Modelos colocados na pasta templates/ do servidor também aparecem aqui. A primeira linha pode ser ',
        h('code', null, '<!-- modelo: Nome | Descrição -->'), '.'));

    const grid = h('div', { class: 'model-grid' }, data.models.map((m) =>
      h('div', { class: 'model-card' },
        previewFrame('/api/models/' + encodeURIComponent(m.id) + '/preview'),
        h('div', { class: 'model-info' },
          h('div', null, h('strong', null, m.name), h('span', { class: 'tag' }, m.kind === 'html' ? 'HTML' : 'Editável'), m.builtin ? null : h('span', { class: 'tag' }, 'enviado')),
          h('p', { class: 'muted small' }, m.description),
          h('div', { class: 'row-gap' },
            h('button', { class: 'btn btn-sm', onclick: () => openPreview(m.name, '/api/models/' + encodeURIComponent(m.id) + '/preview') }, 'Ver'),
            m.kind === 'html' ? h('button', { class: 'btn btn-sm', onclick: () => downloadSource(m) }, 'Baixar HTML') : null,
            data.canManage && !m.builtin ? h('button', { class: 'btn btn-sm', onclick: () => uploadModal(m) }, 'Substituir') : null,
            data.canManage && !m.builtin ? h('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                if (!confirm('Excluir o modelo "' + m.name + '"? Sites já criados com ele deixarão de funcionar.')) return;
                await api('DELETE', '/api/models/' + encodeURIComponent(m.id));
                App.go('#/modelos');
              },
            }, 'Excluir') : null)))));

    return h('div', null,
      App.header('Modelos', 'Modelos editáveis (por blocos) e modelos HTML enviados por você.',
        data.canManage ? [h('button', { class: 'btn btn-primary', onclick: () => uploadModal(null) }, '⬆ Enviar modelo HTML')] : null),
      vars, grid);
  };

  async function downloadSource(m) {
    const src = await api('GET', '/api/models/' + encodeURIComponent(m.id) + '/source');
    const a = h('a', { href: URL.createObjectURL(new Blob([src.html], { type: 'text/html' })), download: (m.name || 'modelo') + '.html' });
    document.body.append(a);
    a.click();
    a.remove();
  }

  function uploadModal(existing) {
    const name = h('input', { type: 'text', value: existing ? existing.name : '', maxlength: '80' });
    const desc = h('input', { type: 'text', value: existing ? existing.description : '', maxlength: '200' });
    const file = h('input', { type: 'file', accept: '.html,.htm,text/html' });
    const info = h('small');
    let html = '';
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      html = await f.text();
      const vars = (html.match(/\{\{[#^/]?\s*[\w.]+\s*\}\}/g) || []).length;
      info.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB · ' + vars + ' variáveis encontradas';
      if (!name.value) name.value = f.name.replace(/\.html?$/, '');
    });
    const close = modal(existing ? 'Substituir modelo' : 'Enviar modelo HTML', [
      h('label', { class: 'field' }, h('span', null, 'Nome'), name),
      h('label', { class: 'field' }, h('span', null, 'Descrição'), desc),
      h('label', { class: 'field' }, h('span', null, 'Arquivo .html'), file, info),
    ], [h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        try {
          const body = { name: name.value, description: desc.value };
          if (html) body.html = html;
          if (existing) await api('PUT', '/api/models/' + encodeURIComponent(existing.id), body);
          else {
            if (!html) return toast('Escolha o arquivo HTML', true);
            await api('POST', '/api/models', body);
          }
          close();
          toast('Modelo salvo');
          App.go('#/modelos');
        } catch (e) {
          toast(e.message, true);
        }
      },
    }, 'Salvar')]);
  }
})();
