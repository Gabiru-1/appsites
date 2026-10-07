/*
 * Definição dos blocos, temas e modelos de página.
 * Compartilhado entre o navegador (window.PageBlocks) e o servidor (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageBlocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALIGN = [
    { value: 'left', label: 'Esquerda' },
    { value: 'center', label: 'Centro' },
    { value: 'right', label: 'Direita' },
  ];

  const BLOCKS = {
    hero: {
      label: 'Banner principal',
      icon: '★',
      fields: [
        { key: 'title', label: 'Título', type: 'text' },
        { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
        { key: 'buttonText', label: 'Texto do botão', type: 'text' },
        { key: 'buttonUrl', label: 'Link do botão', type: 'url' },
        { key: 'bgImage', label: 'Imagem de fundo (URL)', type: 'image' },
        { key: 'bgColor', label: 'Cor de fundo', type: 'color' },
        { key: 'textColor', label: 'Cor do texto', type: 'color' },
        { key: 'align', label: 'Alinhamento', type: 'select', options: ALIGN },
        {
          key: 'height', label: 'Altura', type: 'select', options: [
            { value: 'small', label: 'Pequena' },
            { value: 'medium', label: 'Média' },
            { value: 'large', label: 'Tela cheia' },
          ],
        },
      ],
      defaults: {
        title: 'Um título que chama atenção',
        subtitle: 'Explique em uma frase o que você oferece e por que isso importa.',
        buttonText: 'Saiba mais',
        buttonUrl: '#contato',
        bgImage: '',
        bgColor: '',
        textColor: '#ffffff',
        align: 'center',
        height: 'medium',
      },
    },

    heading: {
      label: 'Título',
      icon: 'H',
      fields: [
        { key: 'text', label: 'Texto', type: 'text' },
        {
          key: 'level', label: 'Tamanho', type: 'select', options: [
            { value: 'h1', label: 'Muito grande (H1)' },
            { value: 'h2', label: 'Grande (H2)' },
            { value: 'h3', label: 'Médio (H3)' },
          ],
        },
        { key: 'align', label: 'Alinhamento', type: 'select', options: ALIGN },
        { key: 'color', label: 'Cor', type: 'color' },
        { key: 'anchor', label: 'Âncora (ex.: sobre)', type: 'text', help: 'Permite criar links como #sobre' },
      ],
      defaults: { text: 'Novo título', level: 'h2', align: 'left', color: '', anchor: '' },
    },

    text: {
      label: 'Texto',
      icon: '¶',
      fields: [
        { key: 'content', label: 'Conteúdo', type: 'textarea', rows: 8, help: 'Use **negrito**, *itálico* e [texto](https://link). Linha em branco cria novo parágrafo.' },
        { key: 'align', label: 'Alinhamento', type: 'select', options: ALIGN },
        {
          key: 'size', label: 'Tamanho da fonte', type: 'select', options: [
            { value: 'small', label: 'Pequeno' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Grande' },
          ],
        },
        { key: 'color', label: 'Cor', type: 'color' },
      ],
      defaults: {
        content: 'Escreva aqui o seu texto. Você pode usar **negrito**, *itálico* e [links](https://exemplo.com).',
        align: 'left',
        size: 'normal',
        color: '',
      },
    },

    image: {
      label: 'Imagem',
      icon: '▣',
      fields: [
        { key: 'src', label: 'URL da imagem', type: 'image' },
        { key: 'alt', label: 'Descrição (acessibilidade)', type: 'text' },
        { key: 'caption', label: 'Legenda', type: 'text' },
        { key: 'width', label: 'Largura (%)', type: 'number', min: 10, max: 100, step: 5 },
        { key: 'link', label: 'Link ao clicar', type: 'url' },
        { key: 'rounded', label: 'Cantos arredondados', type: 'checkbox' },
      ],
      defaults: {
        src: 'https://picsum.photos/seed/appsites/1200/600',
        alt: 'Imagem ilustrativa',
        caption: '',
        width: 100,
        link: '',
        rounded: true,
      },
    },

    gallery: {
      label: 'Galeria',
      icon: '▦',
      fields: [
        {
          key: 'columns', label: 'Colunas', type: 'select', options: [
            { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
          ],
        },
        {
          key: 'images', label: 'Imagens', type: 'items', itemLabel: 'Imagem',
          fields: [
            { key: 'src', label: 'URL', type: 'image' },
            { key: 'alt', label: 'Descrição', type: 'text' },
          ],
          itemDefaults: { src: 'https://picsum.photos/seed/nova/600/600', alt: '' },
        },
      ],
      defaults: {
        columns: '3',
        images: [
          { src: 'https://picsum.photos/seed/g1/600/600', alt: 'Foto 1' },
          { src: 'https://picsum.photos/seed/g2/600/600', alt: 'Foto 2' },
          { src: 'https://picsum.photos/seed/g3/600/600', alt: 'Foto 3' },
        ],
      },
    },

    button: {
      label: 'Botão',
      icon: '⬭',
      fields: [
        { key: 'text', label: 'Texto', type: 'text' },
        { key: 'url', label: 'Link', type: 'url' },
        {
          key: 'variant', label: 'Estilo', type: 'select', options: [
            { value: 'solid', label: 'Preenchido' },
            { value: 'outline', label: 'Contorno' },
          ],
        },
        { key: 'align', label: 'Alinhamento', type: 'select', options: ALIGN },
        { key: 'newTab', label: 'Abrir em nova aba', type: 'checkbox' },
      ],
      defaults: { text: 'Clique aqui', url: '#', variant: 'solid', align: 'center', newTab: false },
    },

    features: {
      label: 'Recursos / colunas',
      icon: '☷',
      fields: [
        { key: 'title', label: 'Título da seção', type: 'text' },
        { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
        {
          key: 'columns', label: 'Colunas', type: 'select', options: [
            { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
          ],
        },
        {
          key: 'items', label: 'Itens', type: 'items', itemLabel: 'Item',
          fields: [
            { key: 'icon', label: 'Ícone (emoji)', type: 'text' },
            { key: 'title', label: 'Título', type: 'text' },
            { key: 'text', label: 'Descrição', type: 'textarea' },
          ],
          itemDefaults: { icon: '✨', title: 'Novo item', text: 'Descreva este item.' },
        },
      ],
      defaults: {
        title: 'Por que nos escolher',
        subtitle: '',
        columns: '3',
        items: [
          { icon: '⚡', title: 'Rápido', text: 'Entregamos resultados em pouco tempo.' },
          { icon: '🔒', title: 'Seguro', text: 'Seus dados protegidos de ponta a ponta.' },
          { icon: '💬', title: 'Suporte', text: 'Atendimento humano quando você precisar.' },
        ],
      },
    },

    quote: {
      label: 'Depoimento',
      icon: '❝',
      fields: [
        { key: 'text', label: 'Depoimento', type: 'textarea' },
        { key: 'author', label: 'Autor', type: 'text' },
        { key: 'role', label: 'Cargo / empresa', type: 'text' },
        { key: 'avatar', label: 'Foto (URL)', type: 'image' },
      ],
      defaults: {
        text: 'Este serviço mudou a forma como trabalhamos. Recomendo de olhos fechados!',
        author: 'Maria Silva',
        role: 'CEO, Empresa X',
        avatar: '',
      },
    },

    profile: {
      label: 'Perfil',
      icon: '☺',
      fields: [
        { key: 'image', label: 'Foto (URL)', type: 'image' },
        { key: 'name', label: 'Nome', type: 'text' },
        { key: 'bio', label: 'Bio', type: 'textarea' },
      ],
      defaults: {
        image: 'https://picsum.photos/seed/perfil/300/300',
        name: 'Seu Nome',
        bio: 'Criador de conteúdo • Empreendedor • Café ☕',
      },
    },

    links: {
      label: 'Lista de links',
      icon: '☰',
      fields: [
        {
          key: 'items', label: 'Links', type: 'items', itemLabel: 'Link',
          fields: [
            { key: 'label', label: 'Texto', type: 'text' },
            { key: 'url', label: 'Link', type: 'url' },
          ],
          itemDefaults: { label: 'Novo link', url: 'https://' },
        },
      ],
      defaults: {
        items: [
          { label: 'Meu site', url: 'https://exemplo.com' },
          { label: 'Instagram', url: 'https://instagram.com' },
          { label: 'Fale comigo no WhatsApp', url: 'https://wa.me/5500000000000' },
        ],
      },
    },

    video: {
      label: 'Vídeo',
      icon: '▶',
      fields: [
        { key: 'url', label: 'Link do YouTube ou Vimeo', type: 'url' },
        { key: 'caption', label: 'Legenda', type: 'text' },
      ],
      defaults: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: '' },
    },

    contact: {
      label: 'Formulário de contato',
      icon: '✉',
      fields: [
        { key: 'title', label: 'Título', type: 'text' },
        { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
        { key: 'buttonText', label: 'Texto do botão', type: 'text' },
        { key: 'successMessage', label: 'Mensagem de sucesso', type: 'text' },
      ],
      defaults: {
        title: 'Entre em contato',
        subtitle: 'Envie sua mensagem e responderemos em breve.',
        buttonText: 'Enviar mensagem',
        successMessage: 'Obrigado! Sua mensagem foi enviada.',
      },
    },

    divider: {
      label: 'Divisor',
      icon: '―',
      fields: [{ key: 'color', label: 'Cor', type: 'color' }],
      defaults: { color: '' },
    },

    spacer: {
      label: 'Espaço',
      icon: '↕',
      fields: [{ key: 'height', label: 'Altura (px)', type: 'number', min: 8, max: 400, step: 8 }],
      defaults: { height: 48 },
    },

    footer: {
      label: 'Rodapé',
      icon: '▁',
      fields: [
        { key: 'text', label: 'Texto', type: 'textarea' },
        { key: 'bgColor', label: 'Cor de fundo', type: 'color' },
        { key: 'textColor', label: 'Cor do texto', type: 'color' },
      ],
      defaults: { text: '© 2026 Minha Empresa. Todos os direitos reservados.', bgColor: '#111827', textColor: '#e5e7eb' },
    },
  };

  const FONTS = [
    { value: 'system', label: 'Padrão do sistema' },
    { value: 'Inter', label: 'Inter' },
    { value: 'Poppins', label: 'Poppins' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Montserrat', label: 'Montserrat' },
    { value: 'Merriweather', label: 'Merriweather (serifa)' },
    { value: 'Playfair Display', label: 'Playfair Display (serifa)' },
  ];

  const SETTINGS_FIELDS = [
    { key: 'description', label: 'Descrição (SEO)', type: 'textarea', help: 'Aparece no Google e ao compartilhar o link.' },
    { key: 'primaryColor', label: 'Cor principal', type: 'color' },
    { key: 'bgColor', label: 'Cor de fundo', type: 'color' },
    { key: 'textColor', label: 'Cor do texto', type: 'color' },
    { key: 'font', label: 'Fonte', type: 'select', options: FONTS },
    {
      key: 'maxWidth', label: 'Largura do conteúdo', type: 'select', options: [
        { value: '560', label: 'Estreita (560px)' },
        { value: '800', label: 'Média (800px)' },
        { value: '1100', label: 'Larga (1100px)' },
      ],
    },
  ];

  const DEFAULT_SETTINGS = {
    description: '',
    primaryColor: '#4f46e5',
    bgColor: '#ffffff',
    textColor: '#1f2937',
    font: 'Inter',
    maxWidth: '1100',
  };

  function uid() {
    return 'b' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function createBlock(type, data) {
    const def = BLOCKS[type];
    if (!def) throw new Error('Tipo de bloco desconhecido: ' + type);
    return { id: uid(), type, data: Object.assign(clone(def.defaults), data ? clone(data) : {}) };
  }

  const TEMPLATES = {
    blank: {
      label: 'Em branco',
      description: 'Comece do zero.',
      build: () => ({ settings: {}, blocks: [] }),
    },
    landing: {
      label: 'Landing page',
      description: 'Banner, recursos, depoimento e contato.',
      build: () => ({
        settings: {},
        blocks: [
          createBlock('hero', { bgColor: '#4f46e5', height: 'large' }),
          createBlock('features'),
          createBlock('heading', { text: 'Sobre nós', align: 'center', anchor: 'sobre' }),
          createBlock('text', {
            align: 'center',
            content: 'Somos uma equipe apaixonada por criar soluções simples para problemas complexos. Há mais de 10 anos ajudando clientes a crescer.',
          }),
          createBlock('quote'),
          createBlock('contact'),
          createBlock('footer'),
        ],
      }),
    },
    bio: {
      label: 'Link na bio',
      description: 'Perfil com lista de links, ideal para redes sociais.',
      build: () => ({
        settings: { maxWidth: '560', bgColor: '#f5f3ff', primaryColor: '#7c3aed', font: 'Poppins' },
        blocks: [
          createBlock('spacer', { height: 32 }),
          createBlock('profile'),
          createBlock('links'),
          createBlock('spacer', { height: 32 }),
        ],
      }),
    },
    portfolio: {
      label: 'Portfólio',
      description: 'Apresente seus trabalhos com galeria.',
      build: () => ({
        settings: { font: 'Montserrat', primaryColor: '#0f766e' },
        blocks: [
          createBlock('hero', {
            title: 'Olá, eu sou designer',
            subtitle: 'Crio marcas e interfaces que as pessoas adoram usar.',
            buttonText: 'Ver trabalhos',
            buttonUrl: '#trabalhos',
            bgColor: '#0f766e',
          }),
          createBlock('heading', { text: 'Trabalhos recentes', align: 'center', anchor: 'trabalhos' }),
          createBlock('gallery'),
          createBlock('contact', { title: 'Vamos trabalhar juntos?' }),
          createBlock('footer', { bgColor: '#0f172a' }),
        ],
      }),
    },
  };

  return { BLOCKS, FONTS, SETTINGS_FIELDS, DEFAULT_SETTINGS, TEMPLATES, createBlock, uid, clone };
});
