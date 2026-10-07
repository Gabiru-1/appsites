# AppSites — Prospecção + Criador de Sites

Sistema para **encontrar clientes no Google Maps** e **criar e publicar sites para eles em minutos**.

**Fluxo:** Prospectar → salvar lead (dados + fotos do Google) → copiar prompt / criar site com um modelo → publicar (no próprio sistema ou na Vercel) → enviar o link pelo WhatsApp → registrar a venda no painel.

## Como rodar

Requisitos: **Node.js 18+**.

```bash
npm install
npm start
# abra http://localhost:3000
```

No primeiro acesso, crie a conta: **o primeiro usuário vira administrador**. Depois, vá em **Configurações** e cole suas chaves.

### Variáveis de ambiente

| Variável            | Padrão   | Para que serve |
|---------------------|----------|----------------|
| `PORT`              | `3000`   | Porta do servidor |
| `DATA_DIR`          | `./data` | Onde ficam o banco (`db.json`), as fotos e a chave de criptografia |
| `PUBLIC_URL`        | —        | Endereço público do sistema (ex.: `https://app.seudominio.com`). Usado nos links das fotos do prompt e nos formulários de sites publicados na Vercel |
| `ALLOW_SIGNUP`      | `true`   | `false` impede novos cadastros (só o admin entra) |
| `APP_SECRET`        | gerado   | Chave que criptografa as chaves de API dos usuários. Se não definir, é gerada em `DATA_DIR/secret.key`. **Não perca esse arquivo.** |
| `ANTHROPIC_API_KEY` | —        | Chave do Claude para todos os usuários (opcional; cada usuário também pode usar a sua) |

## Abas do sistema

| Aba | O que faz |
|-----|-----------|
| **Painel** | Faturamento do mês e total, **recorrência mensal**, ticket médio, conversão, gráfico de vendas por mês, funil de leads e números dos sites |
| **Prospectar** | Busca por nicho + cidade no Google Maps. Filtros: nota mínima, mínimo de avaliações, **sem site** (oportunidade), com telefone, quantidade (20/40/60) |
| **Leads** | CRM com status (Novo → Contatado → Negociando → Vendido/Perdido). Cada lead tem as abas **Informações, Avaliações, Fotos, Horários, Prompt, Abordagem e Venda** |
| **Criar site** | Escolha um lead (ou cole o prompt), escolha o modelo, e o site é montado com nome, fotos, avaliações, horários, mapa e WhatsApp. Opcional: a IA (Claude) escreve os textos |
| **Meus sites** | Editar, publicar em `/p/endereco`, **publicar na Vercel**, exportar (.zip), ver mensagens do formulário |
| **Modelos** | Modelos editáveis por blocos + **modelos HTML enviados por você** |
| **Configurações** | Chaves do Google, Vercel e Anthropic (criptografadas), modelo da mensagem de WhatsApp, senha |

### Fotos

Ao salvar um lead, as fotos do Google Maps são **baixadas automaticamente** para o servidor (até 10; o botão "Importar do Google" busca até 20). Na aba **Fotos** dá para baixar uma por uma ou todas em `.zip`. Elas já entram nos sites e no prompt.

### Prompt

A aba **Prompt** gera um texto com todas as informações do negócio (dados, avaliações, horários, links das fotos) e um bloco `DADOS_DO_SITE (JSON)` no final. Use o botão **Copiar prompt** para:
- colar em **Criar site → Colar prompt**: o sistema lê o bloco de dados e monta o site; ou
- colar em qualquer IA de criação de sites.

## Chaves necessárias

1. **Google Places API (prospecção)**: no [Google Cloud Console](https://console.cloud.google.com/apis/library/places.googleapis.com), ative a **Places API (New)**, crie uma chave em *Credenciais* e ative o faturamento. O Google dá um crédito mensal gratuito. Cada busca, cada lead salvo e cada foto contam como chamadas, e a busca com "Mostrar fotos" ligado faz mais chamadas.
2. **Vercel (publicação)**: em vercel.com → *Account Settings → Tokens*. Cada site vira um projeto `site-<endereco>` na sua conta.
3. **Anthropic (opcional, textos com IA)**: em console.anthropic.com → *API Keys*. Usa o modelo `claude-opus-5-5` com fallback automático do servidor caso a resposta seja recusada.

## Criando seus modelos HTML

Na aba **Modelos → Enviar modelo HTML** (só para administradores), envie um arquivo `.html` com as variáveis onde os dados devem entrar:

```html
<h1>{{titulo}}</h1>
<p>{{subtitulo}}</p>
<a href="{{link_contato}}">{{cta}}</a>
<img src="{{foto_1}}" alt="{{nome}}">

{{#avaliacoes}}
  <blockquote>{{estrelas}} “{{texto}}” — {{autor}}</blockquote>
{{/avaliacoes}}

{{#horarios}}<li>{{dia}}: {{horas}}</li>{{/horarios}}
{{#endereco}}<iframe src="{{maps_embed}}"></iframe>{{/endereco}}
```

- `{{variavel}}`: insere o texto (com escape de HTML).
- `{{{variavel}}}`: insere sem escape (ex.: `{{{sobre_html}}}`).
- `{{#lista}}…{{/lista}}`: repete o trecho para cada item, ou mostra o trecho só se o campo estiver preenchido.
- `{{^campo}}…{{/campo}}`: mostra o trecho só se o campo estiver vazio.

A lista completa de variáveis aparece na própria aba Modelos. Veja o exemplo em [`templates/exemplo-moderno.html`](templates/exemplo-moderno.html). Arquivos colocados na pasta `templates/` aparecem para todos; a primeira linha pode ser `<!-- modelo: Nome | Descrição -->`.

## Onde hospedar (recomendação)

São duas coisas diferentes:

1. **Os sites dos clientes → Vercel.** Já está integrado: um clique publica em `site-xxx.vercel.app`, com HTTPS, CDN e domínio próprio do cliente configurável no painel da Vercel. O plano gratuito (Hobby) é para uso pessoal e não comercial, então para revender sites o indicado é o plano Pro.

2. **Este sistema (painel, login, banco de dados) → um servidor com disco persistente**, como **Railway**, **Render** (com disco), **Fly.io** ou uma VPS (Hostinger, DigitalOcean, Contabo…). O `Dockerfile` já está pronto: monte um volume em `/data` e defina `PUBLIC_URL`.

   O sistema **não roda na Vercel do jeito que está**, porque a Vercel não guarda arquivos (o banco e as fotos ficam em disco). Para levar o painel para a Vercel seria preciso trocar o armazenamento por um banco (ex.: Postgres/Supabase) e as fotos por um storage (ex.: Vercel Blob). É uma evolução possível, mas para começar o servidor com disco é mais simples e barato.

```bash
docker build -t appsites .
docker run -p 3000:3000 -v appsites-data:/data -e PUBLIC_URL=https://app.seudominio.com appsites
```

**Backup:** copie a pasta `DATA_DIR` (contém `db.json`, `media/` e `secret.key`).

## Estrutura

```
server.js               inicia o servidor
lib/app.js              rotas HTTP (API, páginas públicas, fotos, arquivos)
lib/auth.js             cadastro, login (scrypt), sessões
lib/google.js           Google Places API (busca, detalhes, fotos)
lib/leads.js            CRM, importação de fotos, números do painel
lib/sitedata.js         ficha do negócio, geração e leitura do prompt
lib/templates.js        modelos de blocos e HTML (variáveis {{...}})
lib/publish.js          renderização final, exportação e deploy na Vercel
lib/ai.js               textos com Claude (opcional)
lib/secrets.js          criptografia das chaves de API
lib/zip.js, media.js    .zip de fotos e armazenamento de imagens
public/app.html         painel (js/app/*.js)
public/editor.html      editor visual por blocos
public/site.html        editor de sites com modelo HTML
templates/              modelos HTML que vêm com o sistema
test/                   testes (node --test), com Google/Vercel/IA simulados
```

## Testes

```bash
npm test
```
