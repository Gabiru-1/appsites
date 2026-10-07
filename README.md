# AppSites — Sistema de criação de páginas

Construtor visual de páginas e sites: crie páginas a partir de modelos, edite com blocos arrastáveis, veja tudo ao vivo e publique com um clique. Sem dependências: só precisa de **Node.js 18+**.

## Como rodar

```bash
npm start
# abra http://localhost:3000
```

Variáveis de ambiente opcionais:

| Variável         | Padrão          | Descrição                                                                     |
|------------------|-----------------|-------------------------------------------------------------------------------|
| `PORT`           | `3000`          | Porta do servidor                                                             |
| `ADMIN_PASSWORD` | _(vazio)_       | Protege o painel e o editor com senha (HTTP Basic, qualquer usuário). **Recomendado em produção.** |
| `DATA_FILE`      | `data/db.json`  | Arquivo onde as páginas e mensagens são salvas                                |

```bash
ADMIN_PASSWORD=minhasenha PORT=8080 npm start
```

## Funcionalidades

- **Painel de páginas**: criar, buscar, duplicar, excluir e ver miniaturas.
- **Modelos prontos**: em branco, landing page, link na bio e portfólio.
- **Editor visual**:
  - 15 tipos de bloco: banner, título, texto (com **negrito**, *itálico* e links), imagem, galeria, botão, recursos/colunas, depoimento, perfil, lista de links, vídeo (YouTube/Vimeo), formulário de contato, divisor, espaço e rodapé.
  - Pré-visualização ao vivo: clique em qualquer bloco para editá-lo.
  - Reordene blocos arrastando na aba "Estrutura" ou com as setas.
  - Pré-visualização em computador, tablet e celular.
  - Desfazer e refazer (Ctrl+Z / Ctrl+Shift+Z), salvamento automático e atalho Ctrl+S.
  - Tema da página: cores, fonte (Google Fonts), largura e descrição para SEO.
- **Publicação**: as páginas publicadas ficam em `/p/<endereco>`; os rascunhos não são acessíveis ao público.
- **Formulário de contato**: as mensagens recebidas aparecem no painel ("Mensagens"), com proteção anti-spam (honeypot).
- **Exportar HTML**: baixe a página como um arquivo HTML único para hospedar onde quiser.
- **Segurança**: todo o conteúdo é escapado, e URLs e cores são validadas (sem `javascript:` nem injeção de CSS).

## Estrutura

```
server.js              # inicia o servidor
lib/app.js             # rotas HTTP (API, páginas públicas e arquivos estáticos)
lib/pages.js           # criação, validação e atualização de páginas
lib/store.js           # armazenamento em arquivo JSON (escrita atômica)
public/js/blocks.js    # definição dos blocos, temas e modelos (servidor + navegador)
public/js/render.js    # gera o HTML das páginas (servidor + navegador)
public/js/editor.js    # editor visual
public/js/dashboard.js # painel de páginas
test/                  # testes (node --test)
```

### Adicionar um novo tipo de bloco

1. Em `public/js/blocks.js`, adicione uma entrada em `BLOCKS` com `label`, `icon`, `fields` e `defaults`.
2. Em `public/js/render.js`, adicione uma função com o mesmo nome em `renderers` que retorne `{ html }`.

O editor monta o formulário de propriedades automaticamente a partir de `fields`.

## API

| Método | Rota                                   | Descrição                         |
|--------|----------------------------------------|-----------------------------------|
| GET    | `/api/pages`                           | Lista as páginas                  |
| POST   | `/api/pages`                           | Cria uma página `{ title, template }` |
| GET    | `/api/pages/:id`                       | Retorna uma página completa       |
| PUT    | `/api/pages/:id`                       | Atualiza `title`, `slug`, `published`, `settings` e `blocks` |
| DELETE | `/api/pages/:id`                       | Exclui a página                   |
| POST   | `/api/pages/:id/duplicate`             | Duplica a página                  |
| GET    | `/api/pages/:id/export`                | Baixa o HTML                      |
| GET    | `/api/pages/:id/submissions`           | Lista as mensagens do formulário  |
| DELETE | `/api/pages/:id/submissions/:subId`    | Exclui uma mensagem               |
| GET    | `/p/:slug`                             | Página publicada (pública)        |
| POST   | `/p/:slug/contato`                     | Envio do formulário (público)     |

## Testes

```bash
npm test
```
