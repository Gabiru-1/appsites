/* Painel: vendas, recorrência, funil de leads e sites. */
(function () {
  'use strict';
  const { h, api, money } = window.UI;
  const App = window.App;
  const SVG = 'http://www.w3.org/2000/svg';

  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const monthLabel = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + '/' + ym.slice(2, 4);

  function svg(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  function tile(label, value, hint) {
    return h('div', { class: 'tile' },
      h('div', { class: 'tile-label' }, label),
      h('div', { class: 'tile-value' }, value),
      hint ? h('div', { class: 'tile-hint' }, hint) : null);
  }

  // Gráfico de barras: faturamento por mês (uma série, uma cor, dica ao passar o mouse)
  function revenueChart(months) {
    const W = 640, H = 240, padL = 56, padR = 12, padT = 16, padB = 32;
    const max = Math.max(1, ...months.map((m) => m.valor));
    const nice = niceMax(max);
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const slot = plotW / months.length;
    const barW = Math.min(44, slot * 0.55);

    const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Faturamento por mês nos últimos 6 meses' });
    // grade e eixo
    for (let i = 0; i <= 4; i++) {
      const v = (nice / 4) * i;
      const y = padT + plotH - (v / nice) * plotH;
      root.append(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: i === 0 ? 'axis' : 'grid' }));
      const t = svg('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' });
      t.textContent = compact(v);
      root.append(t);
    }
    const tip = h('div', { class: 'chart-tip', hidden: true });
    months.forEach((m, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      const bh = (m.valor / nice) * plotH;
      const y = padT + plotH - bh;
      if (bh > 0) {
        const r = Math.min(4, bh);
        root.append(svg('path', {
          class: 'bar',
          d: 'M' + x + ',' + (padT + plotH) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
            'H' + (x + barW - r) + 'Q' + (x + barW) + ',' + y + ' ' + (x + barW) + ',' + (y + r) + 'V' + (padT + plotH) + 'Z',
        }));
      }
      const lbl = svg('text', { x: x + barW / 2, y: H - 10, 'text-anchor': 'middle', class: 'tick' });
      lbl.textContent = monthLabel(m.mes);
      root.append(lbl);
      // área de toque maior que a barra
      const hit = svg('rect', { x: padL + slot * i, y: padT, width: slot, height: plotH, class: 'hit', tabindex: '0' });
      const show = () => {
        tip.hidden = false;
        tip.replaceChildren(h('strong', null, monthLabel(m.mes)), h('div', null, money(m.valor)),
          h('div', { class: 'muted' }, m.vendas + (m.vendas === 1 ? ' venda' : ' vendas')));
        tip.style.left = ((padL + slot * i + slot / 2) / W * 100) + '%';
        tip.style.top = ((y - 8) / H * 100) + '%';
      };
      hit.addEventListener('mouseenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', () => { tip.hidden = true; });
      hit.addEventListener('blur', () => { tip.hidden = true; });
      root.append(hit);
    });

    const table = h('table', { class: 'table table-compact' },
      h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', null, 'Vendas'), h('th', null, 'Faturamento'))),
      h('tbody', null, months.map((m) => h('tr', null, h('td', null, monthLabel(m.mes)), h('td', null, m.vendas), h('td', null, money(m.valor))))));
    const details = h('details', { class: 'chart-table' }, h('summary', null, 'Ver em tabela'), table);
    return h('div', null, h('div', { class: 'chart-wrap' }, root, tip), details);
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function compact(v) {
    if (v >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return 'R$ ' + Math.round(v);
  }

  function funnel(byStatus) {
    const order = ['novo', 'contatado', 'negociando', 'vendido', 'perdido'];
    const max = Math.max(1, ...order.map((k) => byStatus[k] || 0));
    return h('div', { class: 'funnel' }, order.map((k) =>
      h('a', { class: 'funnel-row', href: '#/leads?status=' + k },
        h('span', { class: 'funnel-label' }, App.STATUS[k].label),
        h('span', { class: 'funnel-track' }, h('span', { class: 'funnel-bar ' + App.STATUS[k].cls, style: 'width:' + ((byStatus[k] || 0) / max * 100) + '%' })),
        h('span', { class: 'funnel-value' }, String(byStatus[k] || 0)))));
  }

  function checklist(d) {
    const s = App.settings;
    const steps = [
      [s.hasGoogle, 'Configurar a chave do Google', '#/config'],
      [d.leads > 0, 'Prospectar e salvar o primeiro lead', '#/prospectar'],
      [d.sites > 0, 'Criar o primeiro site', '#/criar'],
      [d.sitesPublicados > 0 || d.sitesVercel > 0, 'Publicar um site', '#/sites'],
      [d.vendas > 0, 'Registrar a primeira venda', '#/leads'],
    ];
    if (steps.every((x) => x[0])) return null;
    return h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Primeiros passos'),
      h('ol', { class: 'checklist' }, steps.map(([done, label, href]) =>
        h('li', { class: done ? 'done' : '' }, h('span', { class: 'check-dot' }, done ? '✓' : ''), done ? label : h('a', { href }, label)))));
  }

  App.views.painel = async function () {
    const d = await api('GET', '/api/dashboard');
    return h('div', null,
      App.header('Olá, ' + App.me.name.split(' ')[0] + ' 👋', 'Resumo das suas vendas e dos seus sites.',
        [h('a', { class: 'btn btn-primary', href: '#/prospectar' }, '⌕ Prospectar clientes')]),
      checklist(d),
      h('div', { class: 'tiles' },
        tile('Faturamento do mês', money(d.faturamentoMes), d.vendasMes + (d.vendasMes === 1 ? ' venda' : ' vendas') + ' neste mês'),
        tile('Recorrência mensal', money(d.recorrenciaMensal), 'Soma das mensalidades dos clientes'),
        tile('Faturamento total', money(d.faturamentoTotal), d.vendas + (d.vendas === 1 ? ' venda' : ' vendas') + ' no total'),
        tile('Ticket médio', money(d.ticketMedio)),
        tile('Conversão', Math.round(d.conversao * 100) + '%', 'Vendas ÷ leads trabalhados')),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Faturamento por mês'), revenueChart(d.meses)),
        h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Funil de leads'), funnel(d.porStatus),
          h('p', { class: 'muted small' }, d.leads + (d.leads === 1 ? ' lead' : ' leads') + ' no total'))),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, 'Últimas vendas'),
          d.ultimasVendas.length
            ? h('table', { class: 'table' },
              h('thead', null, h('tr', null, h('th', null, 'Cliente'), h('th', null, 'Data'), h('th', null, 'Valor'), h('th', null, 'Mensal'))),
              h('tbody', null, d.ultimasVendas.map((v) => h('tr', null,
                h('td', null, h('a', { href: '#/leads/' + v.id }, v.nome)),
                h('td', null, v.vendidoEm ? v.vendidoEm.split('-').reverse().join('/') : '—'),
                h('td', null, money(v.valor)),
                h('td', null, v.mensalidade ? money(v.mensalidade) : '—')))))
            : h('p', { class: 'muted' }, 'Quando um lead fechar, mude o status para "Vendido" e informe o valor.')),
        h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, 'Sites'),
          h('div', { class: 'mini-stats' },
            h('div', null, h('strong', null, String(d.sites)), h('span', null, 'criados')),
            h('div', null, h('strong', null, String(d.sitesPublicados)), h('span', null, 'publicados')),
            h('div', null, h('strong', null, String(d.sitesVercel)), h('span', null, 'na Vercel')),
            h('div', null, h('strong', null, String(d.mensagens)), h('span', null, 'mensagens'))),
          h('a', { class: 'btn btn-sm', href: '#/sites' }, 'Ver meus sites →'))));
  };
})();
