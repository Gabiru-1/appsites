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

## Publicar o sistema na Vercel

O projeto já vem pronto para a Vercel (`vercel.json` + `api/index.js`). Como a Vercel não tem disco permanente, o sistema precisa de **um banco Postgres** (dados) e de **um lugar para as fotos**. Há duas opções:

| | Banco de dados | Fotos |
|---|---|---|
| **Opção A: Supabase** (tudo num lugar só) | Postgres do Supabase | Supabase Storage (o bucket `appsites-media` é criado sozinho) |
| **Opção B: Vercel** | Neon (Storage → Neon) | Vercel Blob (Storage → Blob) |

### Opção A: Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **Com a integração (mais fácil):** na Vercel, abra o projeto → **Integrations** (ou **Storage**) → **Supabase** → conecte ao seu projeto do Supabase. A Vercel cria sozinha `POSTGRES_URL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

   **Sem a integração:** em **Settings → Environment Variables**, crie:
   - `DATABASE_URL`: no Supabase, botão **Connect** → **Transaction pooler** (porta **6543**). Troque `[YOUR-PASSWORD]` pela senha do banco.
   - `SUPABASE_URL`: em **Project Settings → API**, o campo *Project URL*.
   - `SUPABASE_SERVICE_ROLE_KEY`: em **Project Settings → API**, a chave *service_role* (secreta; nunca coloque no navegador).
3. Crie também `APP_SECRET` (veja abaixo) e faça **Redeploy**.

A tabela `docs` é criada sozinha na primeira requisição. Os dados ficam em JSON por documento (coleção, id, dados), e dá para ver tudo no *Table Editor* do Supabase.

### Opção B: Neon + Vercel Blob

1. No projeto da Vercel, abra **Storage** → **Create Database** → **Neon (Postgres)** → conecte ao projeto (cria `DATABASE_URL`).
2. **Storage** → **Create** → **Blob** → conecte ao projeto (cria `BLOB_READ_WRITE_TOKEN`).

### Variáveis comuns

- `APP_SECRET`: uma senha longa e aleatória. **Guarde-a**: ela criptografa as chaves de API dos usuários; se mudar, as chaves salvas precisam ser cadastradas de novo.
- `PUBLIC_URL` (opcional): o endereço do sistema, ex.: `https://appsites.vercel.app`.

Depois de criar as variáveis, vá em **Deployments → Redeploy**. Se faltar algo, o sistema mostra uma tela explicando o que falta, em vez de dar erro.

> As funções estão configuradas com tempo máximo de 60 s (`vercel.json`), o que serve para todos os planos.

### Sites dos clientes

Os sites criados podem ser publicados de duas formas: em `seu-sistema/p/endereco`, ou como **projeto separado na Vercel** (botão "Publicar na Vercel", com o token configurado em Configurações), onde dá para ligar o domínio do cliente. O plano gratuito (Hobby) da Vercel é para uso pessoal e não comercial, então para revender sites o indicado é o plano Pro.

### Servidor próprio (alternativa)

Fora da Vercel, o sistema roda como servidor comum e guarda tudo em disco (`DATA_DIR`). Use o `Dockerfile` em Railway, Render, Fly.io ou uma VPS, montando um volume em `/data`:

```bash
docker build -t appsites .
docker run -p 3000:3000 -v appsites-data:/data -e PUBLIC_URL=https://app.seudominio.com appsites
```

**Backup (servidor próprio):** copie a pasta `DATA_DIR` (contém `db.json`, `media/` e `secret.key`).

## Estrutura

```
server.js               inicia o servidor (modo servidor próprio)
api/index.js            entrada na Vercel (Supabase ou Neon + Blob)
lib/pgstore.js          armazenamento em Postgres
lib/db.js               conexão Postgres (Neon via HTTP, Supabase e outros via "pg")
lib/app.js              rotas HTTP (API, páginas públicas, fotos, arquivos)
lib/auth.js             cadastro, login (scrypt), sessões
lib/google.js           Google Places API (busca, detalhes, fotos)
lib/leads.js            CRM, importação de fotos, números do painel
lib/sitedata.js         ficha do negócio, geração e leitura do prompt
lib/templates.js        modelos de blocos e HTML (variáveis {{...}})
lib/publish.js          renderização final, exportação e deploy na Vercel
lib/ai.js               textos com Claude (opcional)
lib/secrets.js          criptografia das chaves de API
lib/zip.js, media.js    .zip de fotos e armazenamento de imagens (disco, Vercel Blob ou Supabase Storage)
public/app.html         painel (js/app/*.js)
public/editor.html      editor visual por blocos
public/site.html        editor de sites com modelo HTML
templates/              modelos HTML que vêm com o sistema
test/                   testes (node --test), com Google/Vercel/IA simulados;
                        rodam duas vezes: modo arquivo e modo Postgres (Vercel).
                        Com TEST_DATABASE_URL=postgres://... rodam num Postgres de verdade
```

## Testes

```bash
npm test
```
