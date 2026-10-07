'use strict';

/**
 * "Dados do site": a ficha padronizada de um negócio, usada para
 * gerar o prompt, preencher os modelos e alimentar a IA.
 */

const DAYS_ORDER = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

// Transforma "(41) 99999-0000" em "5541999990000" para links do WhatsApp
function whatsappNumber(lead) {
  const intl = digits(lead.telefoneInternacional);
  if (intl.length >= 12) return intl;
  const nat = digits(lead.telefone);
  if (nat.length === 10 || nat.length === 11) return '55' + nat;
  return nat;
}

function parseHours(lines) {
  return (lines || []).map((line) => {
    const i = String(line).indexOf(':');
    if (i < 0) return { dia: String(line), horas: '' };
    const dia = line.slice(0, i).trim();
    return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), horas: line.slice(i + 1).trim() };
  }).sort((a, b) => DAYS_ORDER.indexOf(a.dia.toLowerCase().split('-')[0]) - DAYS_ORDER.indexOf(b.dia.toLowerCase().split('-')[0]));
}

function mapsEmbedUrl(lead) {
  const q = lead.lat != null && lead.lng != null && !lead.endereco
    ? lead.lat + ',' + lead.lng
    : [lead.nome, lead.endereco].filter(Boolean).join(', ');
  return 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed';
}

/** Gera os dados do site a partir de um lead (com fotos já importadas). */
function fromLead(lead) {
  const d = lead.data || {};
  const nome = d.nome || 'Meu Negócio';
  const categoria = d.categoria || '';
  const cidade = d.cidade || '';
  const wa = whatsappNumber(d);
  const reviews = (d.avaliacoes || []).filter((r) => r.nota >= 4 && r.texto).slice(0, 6);
  const nota = d.avaliacao != null ? String(d.avaliacao).replace('.', ',') : '';

  return {
    nome,
    categoria,
    cidade,
    descricao: d.descricao || '',
    telefone: d.telefone || '',
    whatsapp: wa,
    email: '',
    endereco: d.endereco || '',
    mapsUrl: d.mapsUrl || '',
    mapsEmbed: mapsEmbedUrl(d),
    instagram: '',
    avaliacao: nota,
    totalAvaliacoes: d.totalAvaliacoes || 0,
    horarios: parseHours(d.horarios),
    avaliacoes: reviews.map((r) => ({ autor: r.autor, nota: r.nota, texto: r.texto })),
    fotos: (lead.photos || []).map((p) => p.url),
    // Textos de marketing (podem ser reescritos pela IA ou à mão)
    titulo: nome,
    subtitulo: [categoria, cidade].filter(Boolean).join(' em ') +
      (nota ? ' • Nota ' + nota + ' no Google' + (d.totalAvaliacoes ? ' (' + d.totalAvaliacoes + ' avaliações)' : '') : ''),
    sobre: d.descricao ||
      ('A ' + nome + ' é referência' + (categoria ? ' em ' + categoria.toLowerCase() : '') +
        (cidade ? ' em ' + cidade : '') + '. Atendimento de qualidade, feito por quem entende do assunto e se importa com cada cliente.'),
    servicos: [],
    cta: wa ? 'Chamar no WhatsApp' : 'Entrar em contato',
    corPrincipal: '',
  };
}

const EXAMPLE = {
  nome: 'Pizzaria Bella Napoli',
  categoria: 'Pizzaria',
  cidade: 'Curitiba - PR',
  descricao: 'Pizzas artesanais em forno a lenha.',
  telefone: '(41) 99999-0000',
  whatsapp: '5541999990000',
  email: 'contato@bellanapoli.com.br',
  endereco: 'Rua das Flores, 123 - Centro, Curitiba - PR',
  mapsUrl: 'https://maps.google.com',
  mapsEmbed: 'https://www.google.com/maps?q=Curitiba&output=embed',
  instagram: '',
  avaliacao: '4,8',
  totalAvaliacoes: 532,
  horarios: [
    { dia: 'Segunda-feira', horas: 'Fechado' },
    { dia: 'Terça-feira', horas: '18:00 – 23:00' },
    { dia: 'Sábado', horas: '18:00 – 00:00' },
  ],
  avaliacoes: [
    { autor: 'Ana Souza', nota: 5, texto: 'A melhor pizza da cidade! Massa leve e ingredientes frescos.' },
    { autor: 'Carlos Lima', nota: 5, texto: 'Atendimento excelente e entrega rápida.' },
  ],
  fotos: [
    'https://picsum.photos/seed/pizza1/1200/800',
    'https://picsum.photos/seed/pizza2/1200/800',
    'https://picsum.photos/seed/pizza3/1200/800',
  ],
  titulo: 'A verdadeira pizza napolitana em Curitiba',
  subtitulo: 'Forno a lenha, massa de fermentação natural e ingredientes importados.',
  sobre: 'Desde 2010 levamos a tradição de Nápoles para a sua mesa.',
  servicos: [
    { icone: '🍕', titulo: 'Pizzas artesanais', texto: 'Mais de 30 sabores tradicionais e especiais.' },
    { icone: '🛵', titulo: 'Delivery', texto: 'Entregamos em toda a região central.' },
    { icone: '🎉', titulo: 'Eventos', texto: 'Rodízio e pizzaiolo em domicílio.' },
  ],
  cta: 'Peça pelo WhatsApp',
  corPrincipal: '#b91c1c',
};

/** Limpa e valida os dados recebidos do navegador. */
function clean(input) {
  const src = input && typeof input === 'object' ? input : {};
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 500);
  const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  return {
    nome: str(src.nome, 120),
    categoria: str(src.categoria, 120),
    cidade: str(src.cidade, 120),
    descricao: str(src.descricao, 2000),
    telefone: str(src.telefone, 40),
    whatsapp: digits(src.whatsapp).slice(0, 15),
    email: str(src.email, 200),
    endereco: str(src.endereco, 300),
    mapsUrl: str(src.mapsUrl, 500),
    mapsEmbed: str(src.mapsEmbed, 800),
    instagram: str(src.instagram, 200),
    avaliacao: str(src.avaliacao, 10),
    totalAvaliacoes: Math.max(0, Number(src.totalAvaliacoes) || 0),
    horarios: arr(src.horarios, 14).map((h) => ({ dia: str(h && h.dia, 40), horas: str(h && h.horas, 80) })),
    avaliacoes: arr(src.avaliacoes, 20).map((r) => ({
      autor: str(r && r.autor, 80), nota: Math.min(5, Math.max(0, Number(r && r.nota) || 0)), texto: str(r && r.texto, 1500),
    })),
    fotos: arr(src.fotos, 30).map((f) => str(f, 500)).filter(Boolean),
    titulo: str(src.titulo, 200),
    subtitulo: str(src.subtitulo, 400),
    sobre: str(src.sobre, 3000),
    servicos: arr(src.servicos, 12).map((s) => ({
      icone: str(s && s.icone, 8), titulo: str(s && s.titulo, 100), texto: str(s && s.texto, 400),
    })),
    cta: str(src.cta, 60),
    corPrincipal: /^#[0-9a-f]{6}$/i.test(src.corPrincipal || '') ? src.corPrincipal : '',
  };
}

const PROMPT_MARK_START = '=== DADOS_DO_SITE (JSON) ===';
const PROMPT_MARK_END = '=== FIM_DOS_DADOS ===';

/** Prompt pronto para colar no construtor (ou em qualquer IA de criação de sites). */
function buildPrompt(data, lead) {
  const l = (lead && lead.data) || {};
  const lines = [];
  lines.push('Crie um site profissional, moderno e responsivo (one-page) para o negócio abaixo.');
  lines.push('O objetivo do site é gerar contatos pelo WhatsApp/telefone e transmitir confiança.');
  lines.push('');
  lines.push('## Informações do negócio');
  lines.push('- Nome: ' + data.nome);
  if (data.categoria) lines.push('- Segmento: ' + data.categoria);
  if (data.cidade) lines.push('- Cidade: ' + data.cidade);
  if (data.endereco) lines.push('- Endereço: ' + data.endereco);
  if (data.telefone) lines.push('- Telefone: ' + data.telefone);
  if (data.whatsapp) lines.push('- WhatsApp: https://wa.me/' + data.whatsapp);
  if (data.avaliacao) lines.push('- Avaliação no Google: ' + data.avaliacao + ' estrelas (' + data.totalAvaliacoes + ' avaliações)');
  if (data.mapsUrl) lines.push('- Google Maps: ' + data.mapsUrl);
  if (l.website) lines.push('- Site atual: ' + l.website);
  if (data.descricao) lines.push('- Descrição: ' + data.descricao);
  if (data.horarios.length) {
    lines.push('');
    lines.push('## Horário de funcionamento');
    data.horarios.forEach((h) => lines.push('- ' + h.dia + ': ' + h.horas));
  }
  if (data.avaliacoes.length) {
    lines.push('');
    lines.push('## O que os clientes dizem (avaliações reais do Google)');
    data.avaliacoes.forEach((r) => lines.push('- "' + r.texto.replace(/\s+/g, ' ').trim() + '" — ' + r.autor + ' (' + r.nota + '★)'));
  }
  if (data.fotos.length) {
    lines.push('');
    lines.push('## Fotos do estabelecimento');
    data.fotos.forEach((f, i) => lines.push('- Foto ' + (i + 1) + ': ' + f));
  }
  lines.push('');
  lines.push('## Estrutura sugerida');
  lines.push('1. Banner com título forte, subtítulo e botão de WhatsApp');
  lines.push('2. Sobre o negócio');
  lines.push('3. Serviços/produtos principais');
  lines.push('4. Galeria de fotos');
  lines.push('5. Depoimentos (use as avaliações acima)');
  lines.push('6. Horário de funcionamento e mapa');
  lines.push('7. Contato e rodapé');
  lines.push('');
  lines.push('Escreva todos os textos em português do Brasil, com tom persuasivo e foco em conversão.');
  lines.push('');
  lines.push(PROMPT_MARK_START);
  lines.push(JSON.stringify(data, null, 2));
  lines.push(PROMPT_MARK_END);
  return lines.join('\n');
}

/** Lê os dados de um prompt colado (o bloco JSON no final). */
function parsePrompt(text) {
  const s = String(text || '');
  const start = s.indexOf(PROMPT_MARK_START);
  if (start >= 0) {
    const end = s.indexOf(PROMPT_MARK_END, start);
    const json = s.slice(start + PROMPT_MARK_START.length, end > 0 ? end : undefined);
    try {
      return clean(JSON.parse(json));
    } catch (e) {
      return null;
    }
  }
  // Também aceita um JSON puro colado
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object' && obj.nome) return clean(obj);
  } catch (e) {
    // não é JSON
  }
  return null;
}

module.exports = { fromLead, clean, buildPrompt, parsePrompt, whatsappNumber, EXAMPLE, parseHours };
