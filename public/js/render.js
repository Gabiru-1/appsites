/*
 * Renderizador de páginas: transforma { settings, blocks } em HTML.
 * Compartilhado entre o navegador (window.PageRenderer) e o servidor (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./blocks.js'));
  else root.PageRenderer = factory(root.PageBlocks);
})(typeof self !== 'undefined' ? self : this, function (PB) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  // Aceita apenas protocolos seguros; domínios sem protocolo ganham https://
  function safeUrl(value) {
    const url = String(value == null ? '' : value).trim();
    if (!url) return '#';
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return url;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(url)) return 'https://' + url;
    return '#';
  }

  function cssUrl(value) {
    const url = safeUrl(value);
    return url === '#' ? '' : url.replace(/["'()\\\s]/g, (c) => encodeURIComponent(c));
  }

  function color(value, fallback) {
    return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '')) ? value : fallback;
  }

  function oneOf(value, allowed, fallback) {
    return allowed.indexOf(String(value)) >= 0 ? String(value) : fallback;
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // Markdown mínimo: **negrito**, *itálico*, [texto](url). Aplicado sobre texto já escapado.
  function inline(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
        // href já foi escapado; desfaz &amp; para validar e escapa de novo
        const url = safeUrl(href.replace(/&amp;/g, '&'));
        return '<a href="' + esc(url) + '">' + label + '</a>';
      })
      .replace(/\n/g, '<br>');
  }

  function paragraphs(text) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => '<p>' + inline(p) + '</p>')
      .join('');
  }

  function videoEmbed(url) {
    const u = String(url || '');
    let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    return null;
  }

  function withDefaults(block) {
    const def = PB.BLOCKS[block.type];
    return Object.assign({}, def ? def.defaults : {}, block.data || {});
  }

  const ALIGNS = ['left', 'center', 'right'];

  function buttonHtml(text, url, variant, newTab) {
    if (!text) return '';
    const target = newTab ? ' target="_blank" rel="noopener"' : '';
    const cls = variant === 'outline' ? 'pb-btn pb-btn-outline' : 'pb-btn';
    return '<a class="' + cls + '" href="' + esc(safeUrl(url)) + '"' + target + '>' + esc(text) + '</a>';
  }

  const renderers = {
    hero(d) {
      const align = oneOf(d.align, ALIGNS, 'center');
      const height = oneOf(d.height, ['small', 'medium', 'large'], 'medium');
      const styles = ['color:' + color(d.textColor, '#ffffff'), 'text-align:' + align];
      const bg = color(d.bgColor, '');
      if (bg) styles.push('background-color:' + bg);
      const img = cssUrl(d.bgImage);
      if (img) styles.push("background-image:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url('" + img + "')");
      return {
        cls: 'pb-hero pb-hero-' + height,
        style: styles.join(';'),
        html:
          '<div class="pb-container">' +
          (d.title ? '<h1>' + esc(d.title) + '</h1>' : '') +
          (d.subtitle ? '<p class="pb-lead">' + inline(d.subtitle) + '</p>' : '') +
          buttonHtml(d.buttonText, d.buttonUrl, 'solid', false) +
          '</div>',
      };
    },

    heading(d) {
      const level = oneOf(d.level, ['h1', 'h2', 'h3'], 'h2');
      const c = color(d.color, '');
      const anchor = String(d.anchor || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      return {
        id: anchor,
        html:
          '<div class="pb-container" style="text-align:' + oneOf(d.align, ALIGNS, 'left') + '">' +
          '<' + level + (c ? ' style="color:' + c + '"' : '') + '>' + esc(d.text) + '</' + level + '>' +
          '</div>',
      };
    },

    text(d) {
      const c = color(d.color, '');
      const size = oneOf(d.size, ['small', 'normal', 'large'], 'normal');
      return {
        html:
          '<div class="pb-container pb-text-' + size + '" style="text-align:' + oneOf(d.align, ALIGNS, 'left') +
          (c ? ';color:' + c : '') + '">' + paragraphs(d.content) + '</div>',
      };
    },

    image(d) {
      if (!d.src) return { html: '<div class="pb-container pb-empty">Adicione a URL de uma imagem</div>' };
      const width = clamp(d.width, 10, 100, 100);
      let img = '<img src="' + esc(safeUrl(d.src)) + '" alt="' + esc(d.alt) + '" loading="lazy"' +
        (d.rounded ? ' class="pb-rounded"' : '') + '>';
      if (d.link) img = '<a href="' + esc(safeUrl(d.link)) + '">' + img + '</a>';
      return {
        html:
          '<div class="pb-container"><figure style="width:' + width + '%">' + img +
          (d.caption ? '<figcaption>' + esc(d.caption) + '</figcaption>' : '') +
          '</figure></div>',
      };
    },

    gallery(d) {
      const cols = oneOf(d.columns, ['2', '3', '4'], '3');
      const items = (Array.isArray(d.images) ? d.images : [])
        .filter((i) => i && i.src)
        .map((i) => '<img src="' + esc(safeUrl(i.src)) + '" alt="' + esc(i.alt) + '" loading="lazy">')
        .join('');
      return {
        html: '<div class="pb-container"><div class="pb-grid pb-cols-' + cols + ' pb-gallery">' +
          (items || '<div class="pb-empty">Adicione imagens à galeria</div>') + '</div></div>',
      };
    },

    button(d) {
      return {
        html: '<div class="pb-container" style="text-align:' + oneOf(d.align, ALIGNS, 'center') + '">' +
          buttonHtml(d.text, d.url, d.variant, d.newTab) + '</div>',
      };
    },

    features(d) {
      const cols = oneOf(d.columns, ['2', '3', '4'], '3');
      const items = (Array.isArray(d.items) ? d.items : [])
        .map((i) =>
          '<div class="pb-card">' +
          (i.icon ? '<div class="pb-icon">' + esc(i.icon) + '</div>' : '') +
          (i.title ? '<h3>' + esc(i.title) + '</h3>' : '') +
          (i.text ? '<p>' + inline(i.text) + '</p>' : '') +
          '</div>')
        .join('');
      return {
        html:
          '<div class="pb-container">' +
          (d.title ? '<h2 class="pb-center">' + esc(d.title) + '</h2>' : '') +
          (d.subtitle ? '<p class="pb-center pb-muted">' + inline(d.subtitle) + '</p>' : '') +
          '<div class="pb-grid pb-cols-' + cols + '">' + items + '</div></div>',
      };
    },

    quote(d) {
      return {
        html:
          '<div class="pb-container"><blockquote>' +
          '<p>“' + inline(d.text) + '”</p>' +
          '<footer>' +
          (d.avatar ? '<img src="' + esc(safeUrl(d.avatar)) + '" alt="" class="pb-avatar">' : '') +
          '<div><strong>' + esc(d.author) + '</strong>' +
          (d.role ? '<br><span class="pb-muted">' + esc(d.role) + '</span>' : '') +
          '</div></footer></blockquote></div>',
      };
    },

    profile(d) {
      return {
        html:
          '<div class="pb-container pb-center">' +
          (d.image ? '<img class="pb-profile-img" src="' + esc(safeUrl(d.image)) + '" alt="' + esc(d.name) + '">' : '') +
          (d.name ? '<h1 class="pb-profile-name">' + esc(d.name) + '</h1>' : '') +
          (d.bio ? '<p class="pb-muted">' + inline(d.bio) + '</p>' : '') +
          '</div>',
      };
    },

    links(d) {
      const items = (Array.isArray(d.items) ? d.items : [])
        .filter((i) => i && i.label)
        .map((i) => '<a class="pb-link-item" href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">' + esc(i.label) + '</a>')
        .join('');
      return { html: '<div class="pb-container pb-links">' + items + '</div>' };
    },

    video(d) {
      const src = videoEmbed(d.url);
      const inner = src
        ? '<div class="pb-video-frame"><iframe src="' + esc(src) + '" title="Vídeo" allowfullscreen loading="lazy" ' +
          'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>'
        : '<div class="pb-empty">Cole um link válido do YouTube ou Vimeo</div>';
      return {
        html: '<div class="pb-container">' + inner +
          (d.caption ? '<p class="pb-center pb-muted">' + esc(d.caption) + '</p>' : '') + '</div>',
      };
    },

    contact(d, ctx) {
      const action = ctx.formAction || '#';
      const success = ctx.sent
        ? '<div class="pb-success" role="status">' + esc(d.successMessage) + '</div>'
        : '';
      return {
        id: 'contato',
        html:
          '<div class="pb-container pb-narrow">' +
          (d.title ? '<h2 class="pb-center">' + esc(d.title) + '</h2>' : '') +
          (d.subtitle ? '<p class="pb-center pb-muted">' + inline(d.subtitle) + '</p>' : '') +
          success +
          '<form class="pb-form" method="post" action="' + esc(action) + '">' +
          '<label>Nome<input name="name" required maxlength="120"></label>' +
          '<label>E-mail<input name="email" type="email" required maxlength="200"></label>' +
          '<label>Mensagem<textarea name="message" rows="5" required maxlength="5000"></textarea></label>' +
          '<input name="website" class="pb-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<button class="pb-btn" type="submit">' + esc(d.buttonText || 'Enviar') + '</button>' +
          '</form></div>',
      };
    },

    divider(d) {
      const c = color(d.color, '');
      return { html: '<div class="pb-container"><hr' + (c ? ' style="border-color:' + c + '"' : '') + '></div>' };
    },

    spacer(d) {
      return { style: 'height:' + clamp(d.height, 0, 600, 48) + 'px;padding:0', html: '' };
    },

    footer(d) {
      return {
        tag: 'footer',
        style: 'background:' + color(d.bgColor, '#111827') + ';color:' + color(d.textColor, '#e5e7eb'),
        html: '<div class="pb-container pb-center">' + paragraphs(d.text) + '</div>',
      };
    },
  };

  function renderBlock(block, ctx) {
    const fn = renderers[block.type];
    if (!fn) return '';
    const out = fn(withDefaults(block), ctx);
    const tag = out.tag || 'section';
    const attrs = ['class="pb-block pb-block-' + block.type + (out.cls ? ' ' + out.cls : '') + '"'];
    if (out.id) attrs.push('id="' + esc(out.id) + '"');
    if (out.style) attrs.push('style="' + esc(out.style) + '"');
    if (ctx.editor) attrs.push('data-block-id="' + esc(block.id) + '"');
    return '<' + tag + ' ' + attrs.join(' ') + '>' + out.html + '</' + tag + '>';
  }

  function settingsOf(page) {
    return Object.assign({}, PB.DEFAULT_SETTINGS, (page && page.settings) || {});
  }

  function fontStack(font) {
    if (!font || font === 'system') return 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    const serif = /Merriweather|Playfair/.test(font);
    return '"' + font.replace(/"/g, '') + '",' + (serif ? 'Georgia,serif' : 'system-ui,sans-serif');
  }

  function fontLink(font) {
    const known = PB.FONTS.some((f) => f.value === font);
    if (!known || font === 'system') return '';
    return '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' +
      encodeURIComponent(font).replace(/%20/g, '+') + ':wght@400;600;700&display=swap">';
  }

  function css(s) {
    const primary = color(s.primaryColor, PB.DEFAULT_SETTINGS.primaryColor);
    const bg = color(s.bgColor, PB.DEFAULT_SETTINGS.bgColor);
    const text = color(s.textColor, PB.DEFAULT_SETTINGS.textColor);
    const maxw = oneOf(s.maxWidth, ['560', '800', '1100'], '1100');
    return `
:root{--pb-primary:${primary};--pb-bg:${bg};--pb-text:${text};--pb-maxw:${maxw}px;--pb-font:${fontStack(s.font)}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--pb-bg);color:var(--pb-text);font-family:var(--pb-font);line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:var(--pb-primary)}
h1,h2,h3{line-height:1.2;margin:0 0 .5em}
h1{font-size:clamp(2rem,5vw,3.2rem)}
h2{font-size:clamp(1.6rem,3.5vw,2.3rem)}
h3{font-size:1.25rem}
p{margin:0 0 1em}
.pb-block{padding:40px 0}
.pb-container{max-width:var(--pb-maxw);margin:0 auto;padding:0 20px}
.pb-narrow{max-width:min(var(--pb-maxw),640px)}
.pb-center{text-align:center}
.pb-muted{opacity:.7}
.pb-empty{padding:32px;border:2px dashed currentColor;opacity:.4;text-align:center;border-radius:12px}
.pb-hero{background-color:var(--pb-primary);background-size:cover;background-position:center;display:flex;align-items:center}
.pb-hero .pb-container{width:100%}
.pb-hero-small{min-height:240px}.pb-hero-medium{min-height:420px}.pb-hero-large{min-height:100vh}
.pb-hero .pb-lead{font-size:1.2rem;opacity:.92;max-width:680px;display:inline-block}
.pb-hero[style*="text-align:center"] .pb-lead{margin-left:auto;margin-right:auto}
.pb-hero .pb-btn{background:#fff;color:var(--pb-primary);margin-top:8px}
.pb-hero p{display:block}
.pb-btn{display:inline-block;padding:14px 28px;border-radius:999px;background:var(--pb-primary);color:#fff;text-decoration:none;font-weight:600;border:2px solid var(--pb-primary);cursor:pointer;font:inherit;font-weight:600;transition:transform .15s,opacity .15s}
.pb-btn:hover{transform:translateY(-2px);opacity:.92}
.pb-btn-outline{background:transparent;color:var(--pb-primary)}
.pb-text-small{font-size:.9rem}.pb-text-large{font-size:1.25rem}
figure{margin:0 auto}
figcaption{text-align:center;font-size:.9rem;opacity:.7;margin-top:8px}
.pb-rounded{border-radius:16px}
.pb-grid{display:grid;gap:24px;margin-top:24px}
.pb-cols-2{grid-template-columns:repeat(2,1fr)}.pb-cols-3{grid-template-columns:repeat(3,1fr)}.pb-cols-4{grid-template-columns:repeat(4,1fr)}
.pb-gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}
.pb-card{padding:28px;border-radius:16px;background:color-mix(in srgb,var(--pb-text) 5%,transparent)}
.pb-icon{font-size:2rem;margin-bottom:12px}
blockquote{margin:0 auto;max-width:720px;padding:32px;border-left:4px solid var(--pb-primary);border-radius:12px;background:color-mix(in srgb,var(--pb-primary) 7%,transparent)}
blockquote p{font-size:1.25rem;font-style:italic}
blockquote footer{display:flex;align-items:center;gap:12px}
.pb-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover}
.pb-profile-img{width:120px;height:120px;border-radius:50%;object-fit:cover;margin:0 auto 16px;border:4px solid var(--pb-primary)}
.pb-profile-name{font-size:1.6rem}
.pb-links{display:flex;flex-direction:column;gap:12px}
.pb-link-item{display:block;padding:16px;text-align:center;border-radius:14px;background:var(--pb-primary);color:#fff;text-decoration:none;font-weight:600;transition:transform .15s}
.pb-link-item:hover{transform:scale(1.02)}
.pb-video-frame{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000}
.pb-video-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.pb-form{display:grid;gap:14px;margin-top:16px}
.pb-form label{display:grid;gap:6px;font-weight:600;font-size:.95rem}
.pb-form input,.pb-form textarea{font:inherit;padding:12px 14px;border:1px solid color-mix(in srgb,var(--pb-text) 25%,transparent);border-radius:10px;background:var(--pb-bg);color:var(--pb-text)}
.pb-form input:focus,.pb-form textarea:focus{outline:2px solid var(--pb-primary);border-color:transparent}
.pb-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.pb-success{padding:14px 18px;border-radius:10px;background:#dcfce7;color:#166534;margin:16px 0;font-weight:600}
hr{border:0;border-top:1px solid color-mix(in srgb,var(--pb-text) 20%,transparent);margin:0}
.pb-block-divider{padding:16px 0}
footer.pb-block-footer{padding:32px 0;font-size:.9rem}
footer.pb-block-footer p{margin:0}
@media (max-width:720px){
  .pb-cols-3,.pb-cols-4{grid-template-columns:repeat(2,1fr)}
  .pb-block{padding:28px 0}
}
@media (max-width:480px){
  .pb-cols-2,.pb-cols-3{grid-template-columns:1fr}
}`;
  }

  const EDITOR_CSS = `
[data-block-id]{position:relative;cursor:pointer;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .1s}
[data-block-id]:hover{outline-color:rgba(79,70,229,.45)}
[data-block-id].pb-selected{outline:2px solid #4f46e5}
[data-block-id].pb-selected::after{content:attr(data-label);position:absolute;top:0;left:0;background:#4f46e5;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:4px 8px;border-bottom-right-radius:6px;z-index:5}
.pb-block-spacer[data-block-id]{background:repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(79,70,229,.06) 6px,rgba(79,70,229,.06) 12px)}
.pb-canvas-empty{padding:80px 20px;text-align:center;color:#6b7280;font-family:system-ui,sans-serif}`;

  /**
   * Gera as partes <head> e <body> da página.
   * ctx: { editor, sent, formAction }
   */
  function renderParts(page, ctx) {
    ctx = ctx || {};
    const s = settingsOf(page);
    const title = (page && page.title) || 'Página';
    const head =
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title>' +
      (s.description ? '<meta name="description" content="' + esc(s.description) + '">' +
        '<meta property="og:description" content="' + esc(s.description) + '">' : '') +
      '<meta property="og:title" content="' + esc(title) + '">' +
      fontLink(s.font) +
      '<style>' + css(s) + (ctx.editor ? EDITOR_CSS : '') + '</style>';
    const blocks = (page && Array.isArray(page.blocks)) ? page.blocks : [];
    let body = blocks.map((b) => renderBlock(b, ctx)).join('\n');
    if (!body && ctx.editor) {
      body = '<div class="pb-canvas-empty"><h2>Sua página está vazia</h2><p>Adicione blocos pelo painel à esquerda.</p></div>';
    }
    return { head, body };
  }

  function renderPage(page, ctx) {
    const parts = renderParts(page, ctx);
    return '<!doctype html>\n<html lang="pt-BR"><head>' + parts.head + '</head><body>\n' + parts.body + '\n</body></html>';
  }

  return { renderPage, renderParts, renderBlock, esc, safeUrl, videoEmbed };
});
