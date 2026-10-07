'use strict';

/**
 * Geração dos textos do site com o Claude (opcional).
 * Usa a chave da Anthropic do usuário (Configurações) ou ANTHROPIC_API_KEY do servidor.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5-5';

class AiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 502;
  }
}

const COPY_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'Título principal do banner, até 60 caracteres' },
    subtitulo: { type: 'string', description: 'Subtítulo persuasivo, até 160 caracteres' },
    sobre: { type: 'string', description: 'Texto "sobre nós" com 2 parágrafos curtos separados por linha em branco' },
    servicos: {
      type: 'array',
      description: 'De 3 a 6 serviços ou produtos típicos desse negócio',
      items: {
        type: 'object',
        properties: {
          icone: { type: 'string', description: 'Um único emoji' },
          titulo: { type: 'string' },
          texto: { type: 'string', description: 'Uma frase' },
        },
        required: ['icone', 'titulo', 'texto'],
        additionalProperties: false,
      },
    },
    cta: { type: 'string', description: 'Texto curto do botão principal, ex.: "Agende pelo WhatsApp"' },
    corPrincipal: { type: 'string', description: 'Cor principal combinando com o segmento, em hexadecimal #rrggbb' },
  },
  required: ['titulo', 'subtitulo', 'sobre', 'servicos', 'cta', 'corPrincipal'],
  additionalProperties: false,
};

const SYSTEM = [
  'Você é um copywriter especialista em sites para pequenos negócios locais brasileiros.',
  'Escreva em português do Brasil, com tom acolhedor, confiante e voltado a gerar contatos.',
  'Baseie-se apenas nos dados fornecidos e no que é típico do segmento; não invente prêmios, números, preços ou anos de fundação.',
  'Se houver avaliações de clientes, use os elogios recorrentes como argumentos de venda.',
].join(' ');

function describe(data) {
  const parts = [
    'Nome: ' + data.nome,
    data.categoria && 'Segmento: ' + data.categoria,
    data.cidade && 'Cidade: ' + data.cidade,
    data.descricao && 'Descrição do Google: ' + data.descricao,
    data.avaliacao && 'Nota no Google: ' + data.avaliacao + ' (' + data.totalAvaliacoes + ' avaliações)',
    data.horarios && data.horarios.length && 'Horários: ' + data.horarios.map((h) => h.dia + ' ' + h.horas).join('; '),
  ].filter(Boolean);
  if (data.avaliacoes && data.avaliacoes.length) {
    parts.push('Avaliações de clientes:\n' + data.avaliacoes.map((r) => '- ' + r.texto.replace(/\s+/g, ' ')).join('\n'));
  }
  return parts.join('\n');
}

/**
 * Retorna { titulo, subtitulo, sobre, servicos, cta, corPrincipal }.
 * extra: instruções livres do usuário (ex.: "foco em delivery").
 */
async function generateCopy(apiKey, data, extra, options) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError('Configure sua chave da Anthropic (Claude) em Configurações para usar a IA', 400);
  const client = (options && options.client) || new Anthropic({ apiKey: key });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: COPY_SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: 'Crie os textos do site deste negócio:\n\n' + describe(data) +
          (extra ? '\n\nInstruções adicionais do cliente: ' + String(extra).slice(0, 1000) : ''),
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('Chave da Anthropic inválida', 400);
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Limite de uso da IA atingido. Tente novamente em instantes.', 429);
    if (err instanceof Anthropic.APIError) throw new AiError('Erro da IA: ' + err.message);
    throw new AiError('Não foi possível conectar à IA: ' + err.message);
  }

  if (response.stop_reason === 'refusal') throw new AiError('A IA recusou gerar esse conteúdo', 422);
  if (response.stop_reason === 'max_tokens') throw new AiError('A resposta da IA foi cortada. Tente novamente.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new AiError('A IA retornou um formato inesperado. Tente novamente.');
  }
}

module.exports = { generateCopy, AiError, MODEL, COPY_SCHEMA };
