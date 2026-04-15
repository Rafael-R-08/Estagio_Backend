# LearningHub — Softinsa Backend

API REST do projecto **LearningHub**, desenvolvida com **NestJS 11 + TypeScript**. Oferece autenticação JWT com refresh tokens, gestão completa de formações, análise de perfis com IA (RAG + Groq), recomendações personalizadas, processamento de certificados com OCR, pesquisa semântica com pgvector, notificações por email e push, calendário de eventos e muito mais.

---

## Índice

1. [Stack Tecnológico](#1-stack-tecnológico)
2. [Arquitectura de Módulos](#2-arquitectura-de-módulos)
3. [Pré-requisitos](#3-pré-requisitos)
4. [Clonar o Repositório](#4-clonar-o-repositório)
5. [Instalar Dependências](#5-instalar-dependências)
6. [Configurar Variáveis de Ambiente](#6-configurar-variáveis-de-ambiente)
7. [Iniciar a Infraestrutura com Docker](#7-iniciar-a-infraestrutura-com-docker)
8. [Configurar a Base de Dados](#8-configurar-a-base-de-dados)
9. [Arrancar o Servidor](#9-arrancar-o-servidor)
10. [Verificar que Está Tudo a Funcionar](#10-verificar-que-está-tudo-a-funcionar)
11. [Scripts Disponíveis](#11-scripts-disponíveis)
12. [Gestão da Base de Dados (Prisma)](#12-gestão-da-base-de-dados-prisma)
13. [Documentação da API (Swagger)](#13-documentação-da-api-swagger)
14. [Estrutura do Projecto](#14-estrutura-do-projecto)
15. [Modelos de Base de Dados](#15-modelos-de-base-de-dados)
16. [Roles e Permissões](#16-roles-e-permissões)
17. [Testes](#17-testes)
18. [Logs](#18-logs)
19. [Guia de Contribuição](#19-guia-de-contribuição)

---

## 1. Stack Tecnológico

| Camada | Tecnologia | Versão | Propósito |
|---|---|---|---|
| Framework | NestJS | 11 | Estrutura principal da API |
| Linguagem | TypeScript | 5.x | Type safety em todo o projecto |
| Base de Dados | PostgreSQL + pgvector | 16 | Dados relacionais + embeddings vectoriais |
| ORM | Prisma | 7 | Acesso à BD com type-safety |
| Cache + Filas | Redis + BullMQ | 7 / 5 | Cache de IA e processamento assíncrono |
| Autenticação | JWT + Passport | — | Access token (15m) + Refresh token (7d) |
| IA (LLM) | Groq Cloud (Llama 3.3 70B) | — | Geração de texto, recomendações, análise |
| IA (Embeddings) | Transformers.js (local) | 2.x | Embeddings sem custo, sem API externa |
| OCR | Tesseract.js | 7 | Extracção de texto de certificados PDF/imagem |
| Storage | Supabase Storage | — | Armazenamento de certificados e ficheiros |
| Email | Nodemailer (SMTP) | 8 | Notificações por email |
| Push | Web Push (VAPID) | — | Notificações push para browser |
| Segurança | Helmet + Throttler | — | Headers HTTP seguros + rate limiting |
| Documentação | Swagger / OpenAPI | — | Documentação interactiva da API |
| Contentores | Docker + Docker Compose | — | Infraestrutura local |
| CI/CD | Bitbucket Pipelines | — | Build, testes e validação automática |
| Logs | Winston + DailyRotateFile | — | Logs em consola e em ficheiro rotativo |

---

## 2. Arquitectura de Módulos

```
src/
├── auth/            # Autenticação JWT — login, registo, refresh token, verificação de conta, reset password
├── user/            # Perfil de utilizador, skills, settings, service line
├── trainings/       # CRUD de formações — ongoing, priority, completed, cancelled
├── certificates/    # Upload de certificados PDF/imagem, OCR com Tesseract, metadados
├── ai/              # Integração Groq (LLM), embeddings locais, conversação com IA, planos de curso
├── rag/             # Retrieval-Augmented Generation — indexação e pesquisa semântica de conhecimento
├── recommendations/ # Motor de recomendações personalizadas com base no perfil do utilizador
├── analysis/        # Análise de lacunas de competências, progresso e relatórios de perfil
├── search/          # Pesquisa combinada (texto + semântica via pgvector)
├── collections/     # Colecções personalizadas de cursos criadas pelo utilizador
├── notifications/   # Notificações in-app e por email (agendadas e por evento)
├── calendar/        # Eventos de calendário e lembretes de formações
├── push/            # Notificações push para browser (Web Push API + VAPID)
├── reports/         # Relatórios exportáveis de progresso e actividade
├── admin/           # Endpoints de administração — gestão de utilizadores, plataformas, auditoria
├── sl-manager/      # Funcionalidades de Service Line Manager
├── cache/           # Cache inteligente de respostas de IA (Redis)
├── prisma/          # Módulo e serviço Prisma (injecção global)
├── config/          # Configuração centralizada e validação de variáveis de ambiente
└── common/          # Guards globais, decoradores (@Roles, @Public), filtros e utilitários
```

**Fluxo de um pedido HTTP:**
```
Request
  → ThrottlerGuard (100 req/min por IP)
  → GlobalAuthGuard (verifica JWT, ignora rotas @Public)
  → RolesGlobalGuard (verifica @Roles se aplicável)
  → Controller
  → Service
  → Prisma / Redis / Groq / Supabase
  → Response
```

---

## 3. Pré-requisitos

Antes de começar, instala o seguinte software no teu computador.

### Node.js 20+

- **Download:** https://nodejs.org/en/download — escolher a versão **LTS** (≥ 20)
- Após instalação, verificar no terminal:
  ```bash
  node -v   # deve mostrar v20.x.x ou superior
  npm -v    # deve mostrar v10.x.x ou superior
  ```

### Docker Desktop

- **Download:** https://www.docker.com/products/docker-desktop
- Necessário para correr PostgreSQL e Redis localmente, sem instalar nada manualmente
- Após instalação, verificar:
  ```bash
  docker -v
  docker compose version
  ```
- **Windows com WSL2:** Após instalar o Docker Desktop, activar a integração WSL2:
  - Settings → Resources → WSL Integration → activar para a distro Ubuntu

### Git

- **Download:** https://git-scm.com/downloads
- Verificar: `git --version`

---

## 4. Clonar o Repositório

```bash
# Clonar o repositório (substituir pela URL real do Bitbucket)
git clone https://bitbucket.org/softinsa/learninghub-softinsa-backend.git

# Entrar na pasta do projecto
cd learninghub-softinsa-backend
```

---

## 5. Instalar Dependências

```bash
npm ci
```

> Usar `npm ci` em vez de `npm install` para garantir que as versões do `package-lock.json` são respeitadas exactamente.

---

## 6. Configurar Variáveis de Ambiente

### Passo 1 — Criar o ficheiro `.env`

```bash
cp .env.example .env
```

### Passo 2 — Editar o ficheiro `.env`

Abre o ficheiro `.env` num editor de texto e preenche todas as variáveis. De seguida estão explicadas uma a uma, de onde vêm e como as obter.

---

### Variável a variável — explicação completa

#### Configurações gerais

```env
PORT=3000
NODE_ENV=development
```

- **`PORT`** — Porta onde a API escuta. Manter `3000` em desenvolvimento.
- **`NODE_ENV`** — Ambiente de execução. Usar `development` localmente.

---

#### Base de Dados — PostgreSQL

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/learninghub?schema=public"
```

- **`DATABASE_URL`** — String de ligação ao PostgreSQL.
- Com o `docker-compose.yml` deste projecto, o valor correcto em desenvolvimento é exactamente o que está em cima (user `postgres`, password `postgres`, host `localhost`, porta `5432`, BD `learninghub`).
- Se usares uma BD remota (Supabase, Railway, Neon, etc.), copia a *connection string* do painel desse serviço.
- Formato: `postgresql://USER:PASSWORD@HOST:PORT/NOME_BD?schema=public`

---

#### Autenticação JWT

```env
JWT_SECRET="..."
JWT_ACCESS_TOKEN_EXPIRES_IN="15m"
JWT_REFRESH_TOKEN_SECRET="..."
JWT_REFRESH_TOKEN_EXPIRES_IN="7d"
JWT_VERIFICATION_TOKEN_SECRET="..."
JWT_VERIFICATION_TOKEN_EXPIRES_IN="24h"
JWT_PASSWORD_RESET_TOKEN_SECRET="..."
JWT_PASSWORD_RESET_TOKEN_EXPIRES_IN="1h"
```

- Cada `*_SECRET` deve ser uma string aleatória com **no mínimo 32 caracteres** (obrigação validada no arranque da app).
- **Como gerar segredos seguros** — executar este comando 4 vezes no terminal e copiar cada resultado:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Os valores de expiração podem ser mantidos como estão.

---

#### Redis

```env
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=
```

- Com o Docker Compose do projecto, manter `localhost` e `6379`.
- `REDIS_PASSWORD` — deixar comentado em desenvolvimento (o Redis Docker não tem password).

---

#### Inteligência Artificial — Groq

```env
GROQ_API_KEY="gsk_..."
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_DIM=384
BULLMQ_CONCURRENCY=2
```

- **`GROQ_API_KEY`** — Chave da API do Groq Cloud (LLM).
  1. Ir a **https://console.groq.com**
  2. Criar conta ou fazer login (gratuito)
  3. Menu lateral → **API Keys** → **Create API Key**
  4. Dar um nome à chave e copiar o valor gerado (só é mostrado uma vez)
- **`GROQ_MODEL`** — Manter `llama-3.3-70b-versatile`.
- **`EMBEDDING_MODEL`** e **`EMBEDDING_DIM`** — Modelo local via Transformers.js, **sem API key**. O modelo (~25 MB) é descarregado automaticamente na primeira execução. Não alterar.
- **`BULLMQ_CONCURRENCY`** — Número de jobs de IA em simultâneo. Manter `2` em desenvolvimento.

---

#### Supabase (Armazenamento de ficheiros)

```env
SUPABASE_URL="https://xxxxxxxxxxx.supabase.co"
SUPABASE_SERVICE_KEY="eyJ..."
SUPABASE_BUCKET=certificates
```

- Usado para armazenar os ficheiros de certificados carregados pelos utilizadores.
- **Como obter:**
  1. Ir a **https://supabase.com** e criar conta (gratuito)
  2. Clicar em **New project** e configurar (nome, password, região)
  3. Aguardar o projecto ficar pronto (~1-2 min)
  4. No painel → **Settings** (ícone de engrenagem) → **API**
  5. Copiar o **Project URL** → `SUPABASE_URL`
  6. Copiar a **service_role key** (secção "Project API keys") → `SUPABASE_SERVICE_KEY`
     > ⚠️ Usar a `service_role` key, não a `anon` key. Necessária para escrever no storage.
  7. No painel → **Storage** → **New bucket**
  8. Nome do bucket: `certificates`, desactivar "Public bucket" → **Create**

---

#### Encriptação de API Keys de Plataformas

```env
PLATFORM_ENCRYPTION_KEY="64_chars_hex_aqui"
```

- Chave AES-256 para encriptar as API Keys de plataformas externas (Udemy, Coursera, etc.) guardadas na BD.
- **Obrigatório**. A app não arranca sem este valor.
- **Como gerar:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  O resultado é uma string de 64 caracteres hexadecimais. Copiar para esta variável.

---

#### Email (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=teu.email@gmail.com
SMTP_PASS=app_password_aqui
SMTP_FROM=noreply@learninghub.pt
```

- Usado para emails de verificação, reset de password e notificações.
- **Opção A — Gmail com App Password:**
  1. Ir a **https://myaccount.google.com/security**
  2. Activar **Verificação em 2 passos** (obrigatório)
  3. Pesquisar por "Passwords de aplicações" e criar uma para "Mail"
  4. Copiar a password gerada (16 chars) para `SMTP_PASS`
  5. Colocar o teu email no `SMTP_USER`
- **Opção B — Mailtrap (recomendado em desenvolvimento, não envia emails reais):**
  1. Criar conta gratuita em **https://mailtrap.io**
  2. Email Testing → Inboxes → clicar na inbox
  3. SMTP Settings → copiar `Host`, `Port`, `Username`, `Password`
  4. Actualizar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

---

#### URLs da aplicação

```env
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200
```

- **`APP_URL`** — URL base da API (usada em links de email). Manter em desenvolvimento.
- **`FRONTEND_URL`** — URL do frontend. Usado no CORS. Ajustar conforme a porta do frontend.

---

#### Web Push (Notificações Push para Browser)

```env
VAPID_PUBLIC_KEY="BK..."
VAPID_PRIVATE_KEY="..."
VAPID_EMAIL=mailto:admin@learninghub.pt
```

- Necessário para enviar notificações push para o browser.
- **Como gerar o par de chaves VAPID** (executar uma vez):
  ```bash
  npx web-push generate-vapid-keys
  ```
  O output mostra uma `Public Key` e uma `Private Key`. Copiar para as variáveis correspondentes.
- **`VAPID_EMAIL`** — Email de contacto (formato `mailto:`). Pode ser qualquer email válido.

---

### Exemplo de `.env` completo para desenvolvimento local

```env
PORT=3000
NODE_ENV=development

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/learninghub?schema=public"

JWT_SECRET="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
JWT_ACCESS_TOKEN_EXPIRES_IN="15m"
JWT_REFRESH_TOKEN_SECRET="b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"
JWT_REFRESH_TOKEN_EXPIRES_IN="7d"
JWT_VERIFICATION_TOKEN_SECRET="c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
JWT_VERIFICATION_TOKEN_EXPIRES_IN="24h"
JWT_PASSWORD_RESET_TOKEN_SECRET="d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5"
JWT_PASSWORD_RESET_TOKEN_EXPIRES_IN="1h"

REDIS_HOST=localhost
REDIS_PORT=6379

GROQ_API_KEY="gsk_xxxxxxxxxxxxxxxxxxxx"
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_DIM=384
BULLMQ_CONCURRENCY=2

SUPABASE_URL="https://xxxxxxxxxxx.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_BUCKET=certificates

PLATFORM_ENCRYPTION_KEY="4f3a2b1c8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b"

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=teu.email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_FROM=noreply@learninghub.pt

APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:4200

VAPID_PUBLIC_KEY="BK_public_key_aqui"
VAPID_PRIVATE_KEY="private_key_aqui"
VAPID_EMAIL=mailto:admin@learninghub.pt
```

---

## 7. Iniciar a Infraestrutura com Docker

O `docker-compose.yml` levanta três serviços: **PostgreSQL 16 com pgvector**, **pgAdmin 4** e **Redis 7**.

```bash
# Iniciar todos os serviços em background
docker compose up -d
```

Aguardar 10-20 segundos. Verificar estado:

```bash
docker compose ps
```

Todos os serviços devem aparecer com estado `healthy` ou `running`.

| Serviço | Endereço | Credenciais |
|---|---|---|
| PostgreSQL | `localhost:5432` | user: `postgres` / pass: `postgres` / db: `learninghub` |
| pgAdmin 4 | http://localhost:5050 | email: `admin@local` / pass: `admin` |
| Redis | `localhost:6379` | sem password |

### Ligar ao pgAdmin (inspecção visual da BD)

1. Abrir **http://localhost:5050** no browser
2. Login: `admin@local` / `admin`
3. Clique direito em **Servers** → **Register** → **Server...**
4. Tab **General** → Name: `LearningHub Local`
5. Tab **Connection**:
   - Host: `host.docker.internal` (Windows/Mac) ou `172.17.0.1` (Linux)
   - Port: `5432`
   - Database: `learninghub`
   - Username: `postgres`
   - Password: `postgres`
6. **Save**

---

## 8. Configurar a Base de Dados

### Passo 1 — Gerar o cliente Prisma

Necessário sempre após clonar o repositório ou após alterações ao `schema.prisma`:

```bash
npx prisma generate
```

### Passo 2 — Aplicar as migrações

Cria todas as tabelas na BD com base nas migrações existentes em `prisma/migrations/`:

```bash
npx prisma migrate deploy
```

### Passo 3 — Popular com dados iniciais (seed)

Carrega dados base (plataformas, utilizador admin inicial, etc.):

```bash
npm run seed
```

---

## 9. Arrancar o Servidor

```bash
npm run start:dev
```

O servidor arranca com hot-reload em `http://localhost:3000`.

Deves ver no terminal:

```
[LearningHub] Application is running on: http://[::1]:3000
```

| URL | Descrição |
|---|---|
| `http://localhost:3000/api` | Base da API REST |
| `http://localhost:3000/docs` | Documentação Swagger interactiva |

---

## 10. Verificar que Está Tudo a Funcionar

```bash
# API responde
curl http://localhost:3000/api

# Estado dos contentores Docker
docker compose ps

# Interface visual da base de dados
npx prisma studio
# Abre em http://localhost:5555
```

### Sequência de arranque completa

```bash
# Terminal 1 — Infraestrutura Docker
docker compose up -d

# Terminal 2 — API NestJS
npm run start:dev
```

### Problemas comuns

| Problema | Causa provável | Solução |
|---|---|---|
| `Error: JWT_SECRET deve ter pelo menos 32 caracteres` | Segredo JWT inválido no `.env` | Gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `Error: connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL não está a correr | Executar `docker compose up -d` |
| `Error: connect ECONNREFUSED 127.0.0.1:6379` | Redis não está a correr | Executar `docker compose up -d` |
| `PrismaClientInitializationError` | `DATABASE_URL` incorrecta ou BD inexistente | Verificar `.env` e executar `npx prisma migrate deploy` |
| Porta 3000 em uso | Outro processo a usar a porta | `lsof -i :3000` e matar o processo, ou alterar `PORT` no `.env` |
| Modelo de embeddings a descarregar | Primeira execução do módulo de IA | Normal — aguardar o download (~25 MB) |

---

## 11. Scripts Disponíveis

```bash
# Desenvolvimento
npm run start:dev        # Arrancar em modo watch (hot-reload)
npm run start:debug      # Arrancar em modo debug (porta 9229)
npm run build            # Compilar TypeScript → dist/
npm run start:prod       # Executar build compilado (requer npm run build primeiro)
npm run start            # Alias para start:prod

# Qualidade de código
npm run lint             # Verificar erros de ESLint
npm run format           # Formatar código com Prettier

# Testes
npm run test             # Testes unitários (Jest)
npm run test:watch       # Testes em modo watch
npm run test:cov         # Testes com relatório de cobertura
npm run test:e2e         # Testes end-to-end
npm run test:debug       # Testes em modo debug

# Validação de IA
npm run test:ai:smoke    # Smoke test das funcionalidades de IA
npm run test:ai:flows    # Teste dos fluxos principais de IA
npm run test:ai:endpoints # Teste de todos os endpoints de IA

# Base de dados
npm run seed             # Popular a BD com dados iniciais
npm run db:cleanup-duplicates                       # Remover entradas duplicadas
npm run db:cleanup-non-training-courses:check       # Ver cursos não-formação (dry-run)
npm run db:cleanup-non-training-courses             # Remover cursos não-formação (--apply)
```

---

## 12. Gestão da Base de Dados (Prisma)

```bash
# Aplicar migrações existentes (usar em QA e produção)
npx prisma migrate deploy

# Criar nova migração a partir de alterações no schema.prisma (desenvolvimento)
npx prisma migrate dev --name nome-descritivo-da-migracao

# Ver estado das migrações
npx prisma migrate status

# Validar o schema sem alterar a BD
npx prisma validate

# Formatar o ficheiro schema.prisma
npx prisma format

# Interface visual da BD (abre em http://localhost:5555)
npx prisma studio

# Repor a BD e re-aplicar tudo ⚠️ APAGA TODOS OS DADOS
npx prisma migrate reset

# Gerar o cliente Prisma após alterações ao schema
npx prisma generate
```

> **Regra:** Nunca editar a base de dados directamente. Todas as alterações de schema devem ser feitas via migrações Prisma (`prisma migrate dev`).

---

## 13. Documentação da API (Swagger)

Com o servidor em execução, aceder a:

**http://localhost:3000/docs**

### Como autenticar no Swagger

1. Chamar `POST /api/auth/login` com `email` e `password`
2. Copiar o `accessToken` da resposta
3. Clicar no botão **Authorize** (cadeado) no topo da página
4. Colar o token no campo `Bearer` → **Authorize**
5. Todos os pedidos seguintes enviam o token automaticamente

---

## 14. Estrutura do Projecto

```
learninghub-softinsa-backend/
├── src/
│   ├── main.ts                    # Bootstrap (Swagger, Helmet, CORS, pipes globais, Winston)
│   ├── app.module.ts              # Módulo raiz — regista todos os módulos
│   ├── app.controller.ts          # Health check
│   ├── auth/                      # Login, registo, refresh, verificação, reset password
│   ├── user/                      # Perfil, skills, settings, preferências de UI
│   ├── trainings/                 # Formações (CRUD, status, documentos, recursos)
│   ├── certificates/              # Upload, fila OCR (BullMQ), extracção de metadados
│   ├── ai/
│   │   ├── services/              # ai.service, embedding.service, rag.service, conversation.service, etc.
│   │   ├── extractors/            # Extracção de entidades de texto
│   │   ├── parsers/               # Parsers de output do LLM (JSON, structured)
│   │   └── templates/             # Templates de prompts para o LLM
│   ├── rag/                       # Indexação de conhecimento e pesquisa semântica
│   ├── recommendations/           # Recomendações personalizadas de cursos
│   ├── analysis/                  # Análise de lacunas de competências e progresso
│   ├── search/                    # Pesquisa full-text + vectorial de cursos
│   ├── collections/               # Colecções de cursos do utilizador
│   ├── notifications/             # Notificações in-app + email agendadas
│   ├── calendar/                  # Calendário e lembretes de formações
│   ├── push/                      # Web Push (VAPID)
│   ├── reports/                   # Exportação de relatórios
│   ├── admin/                     # Gestão de utilizadores, plataformas, audit log
│   ├── sl-manager/                # Gestão de Service Line
│   ├── cache/                     # Cache Redis de respostas IA
│   ├── prisma/                    # PrismaService e PrismaModule (global)
│   ├── config/
│   │   ├── configuration.ts       # Mapeamento das variáveis de ambiente
│   │   └── env.validation.ts      # Validação com class-validator no arranque
│   └── common/
│       ├── guards/                # GlobalAuthGuard, RolesGlobalGuard
│       └── decorators/            # @Public(), @Roles(), @CurrentUser()
├── prisma/
│   ├── schema.prisma              # Schema da base de dados
│   ├── seed.ts                    # Script de seed
│   └── migrations/                # Histórico de migrações SQL
├── scripts/                       # Scripts utilitários de manutenção e diagnóstico
├── logs/                          # Logs rotativos (gerados automaticamente)
├── uploads/                       # Ficheiros locais (fallback ao Supabase)
│   └── certificates/
├── docker-compose.yml             # PostgreSQL + pgvector, pgAdmin 4, Redis
├── .env.example                   # Template de variáveis de ambiente
├── nest-cli.json                  # Configuração NestJS CLI
├── tsconfig.json                  # Configuração TypeScript
├── CONTRIBUTING.md                # Guia de contribuição
└── bitbucket-pipelines.yml        # Pipeline CI/CD
```

---

## 15. Modelos de Base de Dados

| Modelo | Descrição |
|---|---|
| `User` | Utilizador com role, service line, skills e nível de experiência |
| `TrainingRecord` | Registo de uma formação (status, progresso, notas, rating, duração) |
| `Certificate` | Certificado de uma formação (ficheiro, metadados OCR, data de validade) |
| `Course` | Curso externo indexado com embedding vectorial para pesquisa semântica |
| `LearningPlatform` | Plataforma externa (Udemy, Coursera, etc.) com API key encriptada AES-256 |
| `TextChunk` | Chunk de texto indexado para RAG com embedding vectorial |
| `Conversation` + `Message` | Histórico de conversas com a IA |
| `UserSettings` | Preferências de notificações e idioma da interface |
| `UserSkill` | Skills do utilizador com nível de proficiência |
| `Notification` | Notificações in-app |
| `CalendarEvent` | Eventos de calendário e lembretes |
| `Collection` | Colecções de cursos personalizadas |
| `PushSubscription` | Subscrições Web Push por dispositivo/browser |
| `RefreshToken` | Refresh tokens JWT com rotação automática |
| `AuditLog` | Log de auditoria de acções administrativas |

---

## 16. Roles e Permissões

| Role | Valor | Descrição |
|---|---|---|
| Utilizador | `USER` | Acesso standard — gere as próprias formações e perfil |
| Administrador | `ADMIN` | Acesso total — gestão de utilizadores, plataformas, audit log |
| Gestor de Service Line | `SERVICE_LINE_MANAGER` | Visualiza e gere a equipa da sua service line |

**Service Lines disponíveis:**

| Valor | Nome |
|---|---|
| `HYBRID_CLOUD` | Hybrid Cloud |
| `DATA` | Data |
| `BUSINESS_APPLICATIONS` | Business Applications |
| `APPLICATION_OPERATIONS` | Application Operations |
| `SOURCING_TALENT_MANAGEMENT` | Sourcing & Talent Management |

---

## 17. Testes

```bash
# Testes unitários
npm run test

# Testes em modo watch (re-executa ao guardar ficheiros)
npm run test:watch

# Testes com relatório de cobertura de código
npm run test:cov

# Testes end-to-end
npm run test:e2e
```

Os ficheiros de teste unitário estão junto ao código com o sufixo `.spec.ts` (ex: `auth.service.spec.ts`).

---

## 18. Logs

Os logs são geridos pelo **Winston** com dois destinos:

- **Consola** — formatados e coloridos em desenvolvimento
- **Ficheiros rotativos** — em `logs/application-YYYY-MM-DD.log`
  - Rotação diária, compressão ZIP
  - Retenção de 14 dias
  - Tamanho máximo por ficheiro: 20 MB

```bash
# Ver logs em tempo real
tail -f logs/application-$(date +%Y-%m-%d).log
```

---

## 19. Guia de Contribuição

### Estrutura de Branches

| Branch | Propósito | Deploy automático |
|---|---|---|
| `main` | Produção — estável e validado | Sim |
| `QA` | Testes/validação integrado | Sim |
| `feature/<nome>` | Nova funcionalidade | Não |
| `fix/<nome>` | Correcção de bug | Não |
| `chore/<nome>` | Manutenção, dependências, configs | Não |
| `refactor/<nome>` | Refactorização | Não |

> **Nunca fazer push directo para `main` ou `QA`.** Toda a alteração entra por Pull Request.

### Conventional Commits

```
<tipo>(<âmbito>): <descrição em português, no infinitivo>
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correcção de bug |
| `docs` | Alterações em documentação |
| `refactor` | Refactorização sem alteração de comportamento |
| `test` | Adição ou correcção de testes |
| `chore` | Manutenção (dependências, configs, CI) |
| `perf` | Melhorias de performance |
| `ci` | Alterações nos ficheiros de CI/CD |

Exemplos:
```bash
feat(auth): adicionar refresh token com rotação automática
fix(rag): corrigir limite de chunks na pesquisa semântica
chore(deps): atualizar prisma para v7.4.1
docs(readme): adicionar secção de variáveis de ambiente
```

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo.

---

## Paragem da Infraestrutura

```bash
# Parar os contentores (mantém os dados)
docker compose down

# Parar e remover os volumes ⚠️ APAGA TODOS OS DADOS DA BD E REDIS
docker compose down -v
```

---

## Referências

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [pgvector](https://github.com/pgvector/pgvector)
- [Groq Console](https://console.groq.com)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [BullMQ Documentation](https://docs.bullmq.io)
- [Mailtrap (SMTP para desenvolvimento)](https://mailtrap.io)
