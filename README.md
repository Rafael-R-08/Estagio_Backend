# LearningHub — Backend

API REST do projeto **LearningHub**, desenvolvida com NestJS. Oferece autenticação JWT, gestão de formações, análise de perfis com IA (RAG + OpenAI), recomendações personalizadas, certificados no Azure Blob Storage e pesquisa semântica com pgvector.

---

## Índice

- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Correr com Docker](#correr-com-docker)
- [Correr o Backend em WSL](#correr-o-backend-em-wsl)
- [Correr o Frontend em Windows](#correr-o-frontend-em-windows)
- [Migrações de Base de Dados](#migrações-de-base-de-dados)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Documentação da API](#documentação-da-api)

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 + TypeScript |
| Base de dados | PostgreSQL 16 + pgvector |
| ORM | Prisma 7 |
| Cache | Redis 7 |
| Autenticação | JWT (access + refresh tokens) via Passport |
| IA | OpenAI (GPT-4 Turbo, text-embedding-3-small) + Ollama (local) |
| Armazenamento | Azure Blob Storage |
| Documentação API | Swagger / OpenAPI (disponível em `/docs`) |
| CI/CD | Bitbucket Pipelines |
| Contentores | Docker + Docker Compose |

---

## Arquitetura

```
src/
├── auth/            # Autenticação JWT (login, refresh, registo)
├── user/            # Gestão de utilizadores e perfis
├── trainings/       # CRUD de formações
├── certificates/    # Upload e gestão de certificados (Azure Blob)
├── ai/              # Integração OpenAI (geração de texto, embeddings)
├── rag/             # Retrieval-Augmented Generation (pesquisa semântica)
├── recommendations/ # Motor de recomendações personalizadas
├── analysis/        # Análise de perfis e lacunas de competências
├── search/          # Pesquisa combinada (texto + semântica)
├── scraper/         # Recolha automática de formações externas
├── cache/           # Queue e cache para pedidos Ollama
├── prisma/          # Módulo e serviço Prisma
├── config/          # Configuração centralizada via variáveis de ambiente
└── common/          # Guards globais, decoradores e utilitários partilhados
```

**Fluxo de pedido:**
```
Cliente → ThrottlerGuard (30 req/min) → GlobalAuthGuard → RolesGuard → Controller → Service → Prisma/OpenAI/Redis
```

---

## Pré-requisitos

- Node.js >= 20
- npm >= 10
- Docker + Docker Compose
- (Opcional) WSL2 com Ubuntu para desenvolvimento local

---

## Variáveis de Ambiente

Cria um ficheiro `.env` na raiz do projeto com base no seguinte template:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Base de Dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/learninghub

# JWT
JWT_SECRET=
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_SECRET=
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
JWT_VERIFICATION_TOKEN_SECRET=
JWT_VERIFICATION_TOKEN_EXPIRES_IN=1d
JWT_PASSWORD_RESET_TOKEN_SECRET=
JWT_PASSWORD_RESET_TOKEN_EXPIRES_IN=1h

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=
AZURE_CONTAINER_NAME=certificates
```

---

## Correr com Docker

A forma mais simples de correr toda a infraestrutura (PostgreSQL + pgvector, pgAdmin, Redis):

```bash
# Iniciar todos os serviços
docker compose up -d

# Verificar que estão a correr
docker compose ps

# Parar os serviços
docker compose down
```

Serviços disponíveis após arranque:

| Serviço | URL / Porta |
|---|---|
| PostgreSQL | `localhost:5432` |
| pgAdmin | http://localhost:5050 (admin@local / admin) |
| Redis | `localhost:6379` |

---

## Correr o Backend em WSL

> Estes passos assumem WSL2 com Ubuntu e Docker Desktop com integração WSL ativa.

```bash
# 1. Clonar o repositório (dentro do WSL)
git clone <url-do-repositório>
cd learninghub-softinsa-backend

# 2. Instalar dependências
npm ci

# 3. Criar o ficheiro .env (ver secção Variáveis de Ambiente)
cp .env.example .env
# Editar .env com os valores corretos

# 4. Iniciar a infraestrutura com Docker
docker compose up -d

# 5. Gerar o cliente Prisma
npx prisma generate

# 6. Aplicar migrações
npx prisma migrate deploy

# 7. (Opcional) Popular a base de dados com dados iniciais
npx prisma db seed

# 8. Arrancar o servidor em modo desenvolvimento
npm run start:dev
```

A API fica disponível em: `http://localhost:3000/api`  
Swagger: `http://localhost:3000/docs`

---

## Correr o Frontend em Windows

> O frontend é um repositório separado. Clonar e correr directamente no Windows (não é necessário WSL).

```powershell
# 1. Clonar o repositório do frontend
git clone <url-do-frontend>
cd learninghub-softinsa-frontend

# 2. Instalar dependências
npm ci

# 3. Criar o ficheiro .env.local
# Definir a URL da API, por exemplo:
# NEXT_PUBLIC_API_URL=http://localhost:3000/api

# 4. Arrancar o servidor de desenvolvimento
npm run dev
```

O frontend fica disponível em: `http://localhost:3000` (ou a porta configurada).

> **Nota:** O backend deve estar a correr no WSL antes de iniciar o frontend. O Windows acede ao WSL via `localhost` automaticamente.

---

## Migrações de Base de Dados

```bash
# Aplicar todas as migrações pendentes (produção / QA)
npx prisma migrate deploy

# Criar uma nova migração em desenvolvimento
npx prisma migrate dev --name <nome-da-migração>

# Validar o schema sem aplicar alterações
npx prisma validate

# Abrir o Prisma Studio (interface visual da BD)
npx prisma studio

# Repor a base de dados e re-aplicar todas as migrações (⚠️ destrói dados)
npx prisma migrate reset
```

---

## Scripts Disponíveis

```bash
npm run start:dev     # Modo desenvolvimento com hot-reload
npm run start:prod    # Modo produção (requer build prévio)
npm run build         # Compilar TypeScript
npm run lint          # Verificar erros de linting
npm run format        # Formatar código com Prettier
npm run test          # Testes unitários
npm run test:cov      # Testes com cobertura
npm run test:e2e      # Testes end-to-end
```

---

## Documentação da API

Com o servidor em execução, a documentação Swagger está disponível em:

```
http://localhost:3000/docs
```

Todos os endpoints protegidos requerem autenticação Bearer JWT. Usar o botão **Authorize** no Swagger para introduzir o token.

---

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
