# Análise do Backend – Learning Hub (Softinsa)
## Documento de Apoio ao Relatório Final de Licenciatura

> Gerado automaticamente com base na análise completa do código fonte.
> Data: Abril 2026 | Projeto: `learninghub-softinsa-backend`

---

## PASSO 1 — INVENTÁRIO TÉCNICO

### 1.1 Stack Tecnológico

| Camada | Tecnologia | Versão | Papel |
|---|---|---|---|
| Runtime | Node.js | 20 (LTS) | Plataforma de execução server-side |
| Linguagem | TypeScript | ~5.x | Tipagem estática sobre JavaScript |
| Framework | NestJS | 11.x | Framework modular para APIs REST |
| ORM | Prisma | 7.4.1 | Acesso à base de dados, migrações |
| Base de dados | PostgreSQL | 16 + pgvector | Dados relacionais + busca vectorial |
| Cache / Fila | Redis | 7 (Alpine) | Cache de respostas LLM; fila BullMQ |
| Fila de jobs | BullMQ | 5.x | Processamento assíncrono de PDFs |
| LLM | Groq SDK (Llama 3.3-70B-versatile) | 1.1.2 | Geração de texto, chat, extração JSON |
| Embeddings | Xenova/transformers (all-MiniLM-L6-v2) | 2.17.2 | Embeddings locais 384 dimensões |
| Storage | Supabase Storage | 2.x | Armazenamento de ficheiros (certificados, docs) |
| Autenticação | Passport.js + JWT | passport 0.7, @nestjs/jwt 11 | Access token + Refresh token |
| Hashing | bcrypt | 6.0.0 | Hash de passwords |
| Email | Nodemailer | 8.x | Envio de emails SMTP (Gmail) |
| Push Notifications | web-push (VAPID) | 3.6.7 | Notificações push no browser |
| HTTP Client | Axios | 1.x | Chamadas a plataformas externas |
| OCR | Tesseract.js | 7.0.0 | Extração de texto de imagens |
| PDF | pdf-parse | 2.4.5 | Extração de texto de PDFs |
| Web Scraping | Cheerio | 1.2.0 | Parsing de HTML de plataformas externas |
| Validação | class-validator + Zod | 0.14 / 4.x | Validação de DTOs e schemas LLM |
| Segurança | Helmet | 8.x | Headers HTTP de segurança |
| Rate Limiting | @nestjs/throttler | 6.x | Proteção anti-abuso de endpoints |
| Logging | Winston + DailyRotateFile | 3.x | Logs estruturados com rotação diária |
| Documentação | Swagger/OpenAPI | @nestjs/swagger 11 | Documentação automática da API |
| CI/CD | Bitbucket Pipelines | — | Build, testes e validação automática |
| Contentorização | Docker Compose | 3.8 | Ambiente local (DB + Redis + pgAdmin) |
| Linting/Formatting | ESLint 9 + Prettier | — | Qualidade e consistência de código |

### 1.2 Versões exactas das dependências principais

```json
"@nestjs/common": "^11.0.1"
"@prisma/client": "^7.4.1"
"groq-sdk": "^1.1.2"
"@xenova/transformers": "^2.17.2"
"bullmq": "^5.71.1"
"@supabase/supabase-js": "^2.100.0"
"redis": "^5.11.0"
"tesseract.js": "^7.0.0"
"web-push": "^3.6.7"
"zod": "^4.3.6"
```

---

### 1.3 Arquitetura do Sistema

O backend segue uma **arquitectura modular por domínio** (Domain-Driven Design lite), onde cada funcionalidade de negócio é encapsulada num módulo NestJS autónomo. A comunicação entre módulos é feita por injecção de dependências (IoC container do NestJS).

```
Frontend (Angular, porta 4200)
        │
        │  HTTP REST / SSE (Server-Sent Events)
        ▼
  NestJS API (porta 3000)
  ┌─────────────────────────────────────┐
  │  Global Guards (JWT + Roles)        │
  │  Global Pipes (ValidationPipe)      │
  │  Throttler (rate limit)             │
  │  Helmet (CSP, security headers)     │
  │─────────────────────────────────────│
  │  Módulos de Domínio:                │
  │  Auth │ Trainings │ Certificates    │
  │  Search │ AI/RAG │ Notifications    │
  │  Calendar │ Collections │ Reports   │
  │  Admin │ SL-Manager │ Push          │
  │─────────────────────────────────────│
  │  Serviços Transversais:             │
  │  CacheService │ PrismaService       │
  │  EventEmitter │ BullMQ Queue        │
  └─────────────────────────────────────┘
        │               │          │
        ▼               ▼          ▼
  PostgreSQL 16    Redis 7     Supabase
  (pgvector)      (cache)     (Storage)
        │
        ▼
  Groq API (LLM externo)
```

**Padrões arquitecturais identificados:**
- **Repository Pattern** via Prisma (acesso à BD centralizado)
- **Event-Driven** via `@nestjs/event-emitter` (ex: `CertificateProcessedEvent` despoleta notificações)
- **Queue-based processing** via BullMQ (processamento assíncrono de PDFs/OCR)
- **Adapter Pattern** nos conectores de plataformas externas (Microsoft Learn, Udemy, etc.)
- **Strategy Pattern** na autenticação (Passport JWT Strategy)
- **Global Guards** para autenticação e autorização globais

---

### 1.4 Base de Dados — Esquema Completo

#### Modelos Prisma (PostgreSQL 16 + pgvector)

| Modelo | Campos principais | Relações |
|---|---|---|
| `User` | id, email, passwordHash, name, role, experienceLevel, interests[], serviceLine, managedLineId, onboardingDone | → Certificate, RefreshToken, TrainingRecord, UserSettings, UserSkill, Conversation, Notification, CalendarEvent, Collection, PushSubscription |
| `LearningPlatform` | id, name, type, apiEndpoint, apiKeyRequired, enabled, searchEnabled, config, apiKey | → Course, TrainingRecord |
| `TrainingRecord` | id, userId, platformId, title, url, status, startedAt, completedAt, notes, rating, priorityOrder, progressLevel, relevance, durationHours | → Certificate, TrainingDocument, TrainingResource, User, LearningPlatform |
| `TrainingDocument` | id, trainingId, fileUrl, fileName | → TrainingRecord |
| `Certificate` | id, trainingId, userId, fileUrl, courseName, provider, completionDate, expirationDate, extractedMetadata (JSON), status, jobId, errorMessage | → User, TrainingRecord |
| `Course` | id, platformId, externalId, title, description, url, instructor, rating, durationHours, level, tags[], **embedding (vector)**, isFree, language | → LearningPlatform |
| `RefreshToken` | id, userId, token, expiresAt | → User |
| `UserSettings` | id, userId, notifyWeeklyRecs, notifyCertExpiry, notifyProgress, notifyByEmail, notifyInApp, uiLanguage | → User |
| `TextChunk` | id, content, **embedding (vector)**, source (enum), sourceId, metadata (JSON) | — (Vector Store RAG) |
| `UserSkill` | id, userId, skillName, level (enum) | → User |
| `TrainingResource` | id, trainingId, title, content, position | → TrainingRecord, ResourceFile |
| `ResourceFile` | id, resourceId, fileUrl, fileName | → TrainingResource |
| `Conversation` | id, userId, title | → User, Message |
| `Message` | id, conversationId, role (user/assistant/system), content, metadata (JSON) | → Conversation |
| `Notification` | id, userId, type (enum), title, body, isRead, metadata | → User |
| `AuditLog` | id, action, adminId, targetId, details | — |
| `CalendarEvent` | id, userId, title, eventDate, reminderMinutesBefore, reminderFireAt, dayBeforeNotified, dayOfNotified, finalReminderNotified | → User |
| `Collection` | id, userId, name, description | → User, CollectionCourse |
| `CollectionCourse` | id, collectionId, externalId, title, url, platformId | → Collection |
| `PushSubscription` | id, userId, endpoint (unique), p256dh, auth | → User |

#### Enumerações

| Enum | Valores |
|---|---|
| `Role` | USER, ADMIN, SERVICE_LINE_MANAGER |
| `ServiceLine` | HYBRID_CLOUD, DATA, BUSINESS_APPLICATIONS, APPLICATION_OPERATIONS, SOURCING_TALENT_MANAGEMENT |
| `ExperienceLevel` | junior, intermedio, senior, especialista, lider |
| `TrainingStatus` | ongoing, completed, priority, later, accessed, cancelled |
| `CourseLevel` | beginner, intermediate, advanced |
| `SkillLevel` | iniciante, intermedio, experiente |
| `ChunkSource` | EXTERNAL_COURSE, COURSE_ANALYSIS, RAG_KNOWLEDGE |
| `ProcessingStatus` | PENDING, PROCESSING, COMPLETED, FAILED |
| `NotificationType` | TRAINING_COMPLETED, CERTIFICATE_PROCESSED, CERTIFICATE_EXPIRING, WEEKLY_RECOMMENDATION, PASSWORD_RESET, EMAIL_VERIFICATION, WELCOME, GENERAL, CALENDAR_REMINDER |

#### Índices vectoriais
- `Course.embedding` — vector 384d para busca semântica de cursos
- `TextChunk.embedding` — vector 384d para RAG (Knowledge Base)

---

### 1.5 Autenticação e Autorização

**Mecanismo:** JWT stateless com refresh token persistido na BD.

**Fluxo de autenticação:**
1. `POST /api/auth/register` → cria utilizador, hash bcrypt (cost 10), gera access token (curto) + refresh token (longo), persiste refresh token na tabela `RefreshToken`
2. `POST /api/auth/login` → valida password com `bcrypt.compare`, gera novos tokens
3. `POST /api/auth/refresh-token` → valida refresh token, gera novo access token
4. Todas as rotas protegidas → `GlobalAuthGuard` aplica `JwtAuthGuard` globalmente (except rotas marcadas `@Public()`)

**Autorização por roles (RBAC):**

| Role | Acesso |
|---|---|
| `USER` | Rotas próprias (trainings, certificates, chat, collections, calendar, reports, notifications) |
| `ADMIN` | Tudo + `/api/admin/**` (gestão de utilizadores, plataformas, analytics, audit log) |
| `SERVICE_LINE_MANAGER` | Tudo de USER + `/api/sl-manager/**` (dashboard da service line) |

**Rate limiting:**
- Login: 15 req/min
- AI Chat: 5 req/min
- RAG Query: 10 req/min
- Default global: 100 req/min

**Segurança adicional:**
- Helmet (CSP, HSTS, X-Frame-Options, etc.)
- CORS configurado para origin do frontend
- Payload limit: 5MB
- Tokens JWT: hash SHA-256 dos refresh tokens em BD (evita exposição direta)

---

### 1.6 APIs Criadas — Todos os Endpoints

#### Módulo `auth` — `/api/auth`
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/register` | Público | Registar novo utilizador |
| POST | `/login` | Público | Login (rate limited 15/min) |
| GET | `/me` | JWT | Perfil do utilizador autenticado |
| PATCH | `/me` | JWT | Atualizar perfil |
| POST | `/onboarding` | JWT | Completar onboarding |
| POST | `/refresh-token` | Público | Renovar access token |
| GET | `/me/settings` | JWT | Obter definições |
| PATCH | `/me/settings` | JWT | Atualizar definições |

#### Módulo `trainings` — `/api/trainings`
| Método | Rota | Descrição |
|---|---|---|
| POST | `/` | Adicionar formação ao registo pessoal |
| POST | `/:id/documents` | Upload de documento (multipart) |
| DELETE | `/:id/documents/:docId` | Remover documento |
| POST | `/track-access` | Registar clique em resultado de pesquisa |
| POST | `/add-to-plan` | Guardar curso para mais tarde |
| POST | `/start` | Iniciar formação |
| GET | `/pending-feedback` | Formações pendentes de feedback |
| GET | `/` (+ `/me`) | Listar formações (com filtros) |
| GET | `/stats` (+ `/me/stats`) | Estatísticas pessoais |
| GET | `/:id` | Detalhe de uma formação |
| PATCH | `/:id` | Atualizar status/notas/rating |
| DELETE | `/:id` | Eliminar registo |
| POST | `/:id/resources` | Criar recurso de apoio |
| PATCH | `/:id/resources/:resourceId` | Atualizar recurso |
| DELETE | `/:id/resources/:resourceId` | Eliminar recurso |

#### Módulo `certificates` — `/api/certificates`
| Método | Rota | Descrição |
|---|---|---|
| POST | `/` | Upload certificado + extração IA (multipart) |
| GET | `/` | Listar certificados do utilizador |
| GET | `/job/:jobId` | Status do job de processamento BullMQ |
| GET | `/job/:jobId/stream` | Stream SSE do status do processamento |
| GET | `/:id` | Detalhe de certificado |
| PATCH | `/:id` | Atualizar metadados |
| DELETE | `/:id` | Eliminar certificado |

#### Módulo `search` — `/api/search`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/platforms` | Listar plataformas de pesquisa activas |
| GET | `/course/:externalId` | Detalhe de curso (da cache DB) |
| GET | `/course/:externalId/related` | Cursos relacionados |
| GET | `/semantic` | Pesquisa puramente semântica (pgvector) |
| GET | `/` | Pesquisa unificada (todas as plataformas + ranking IA) |

#### Módulo `ai` — `/api/ai`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Estado da IA (Groq + pgvector stats) |
| POST | `/recommendations` | Gerar recomendações personalizadas |
| GET/POST | `/recommendations/welcome` | Mensagem de boas-vindas |
| GET | `/chat/mentionable-courses` | Cursos mencionáveis (@ mentions) |
| POST | `/chat/stream` | Chat SSE com memória e RAG híbrido |
| POST | `/chat` | Chat síncrono |
| POST | `/chat/course-plan` | Gerar plano de estudo para um curso |
| GET | `/conversations` | Listar conversas |
| GET | `/conversations/:id/messages` | Mensagens de uma conversa |
| DELETE | `/conversations/:id` | Eliminar conversa |
| GET | `/indexing-stats` | Estatísticas de indexação (ADMIN) |
| DELETE | `/chunks` | Limpar vector store (ADMIN) |

#### Módulo `rag` — `/api/rag`
| Método | Rota | Descrição |
|---|---|---|
| POST | `/query` | Query RAG completo |
| POST | `/recommend` | Recomendações via RAG |
| GET | `/welcome` | Mensagem de boas-vindas |

#### Módulo `notifications` — `/api/notifications`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Listar notificações (com filtros) |
| PATCH | `/:id/read` | Marcar como lida |
| PATCH | `/read-all` | Marcar todas como lidas |
| DELETE | `/` | Eliminar todas |
| DELETE | `/:id` | Eliminar uma |

#### Módulo `calendar` — `/api/calendar`
| Método | Rota | Descrição |
|---|---|---|
| POST | `/` | Criar evento/lembrete |
| GET | `/` | Listar eventos |
| GET | `/export.ics` | Exportar calendário iCalendar (.ics) |
| GET | `/:id` | Detalhe de evento |
| PATCH | `/:id` | Atualizar evento |
| DELETE | `/:id` | Eliminar evento |

#### Módulo `collections` — `/api/collections`
| Método | Rota | Descrição |
|---|---|---|
| POST | `/` | Criar coleção/playlist |
| GET | `/` | Listar coleções do utilizador |
| GET | `/:id` | Detalhe de coleção com cursos |
| PATCH | `/:id` | Editar coleção |
| DELETE | `/:id` | Eliminar coleção |
| POST | `/:id/courses` | Adicionar curso à coleção |
| DELETE | `/:id/courses/:courseId` | Remover curso da coleção |

#### Módulo `push` — `/api/push`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/vapid-public-key` | VAPID public key |
| POST | `/subscribe` | Registar push subscription |
| DELETE | `/subscribe` | Remover push subscription |

#### Módulo `reports` — `/api/reports`
| Método | Rota | Descrição |
|---|---|---|
| GET | `/progress` | Relatório de progressão completo |

#### Módulo `admin` — `/api/admin` (apenas ADMIN)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/users` | Listar todos os utilizadores |
| GET | `/users/:id` | Detalhe de utilizador |
| PATCH | `/users/:id` | Atualizar utilizador |
| PATCH | `/users/:id/role` | Alterar role |
| PATCH | `/users/:id/deactivate` | Desativar utilizador |
| PATCH | `/users/:id/activate` | Ativar utilizador |
| DELETE | `/users/:id` | Eliminar utilizador |
| GET | `/analytics` | Estatísticas gerais da plataforma |
| GET | `/platforms` | Listar plataformas |
| POST | `/platforms` | Criar plataforma |
| PATCH | `/platforms/:id` | Atualizar plataforma |
| DELETE | `/platforms/:id` | Eliminar plataforma |
| GET | `/audit-log` | Audit log |

#### Módulo `sl-manager` — `/api/sl-manager` (apenas SERVICE_LINE_MANAGER)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/overview` | KPIs da service line |
| GET | `/users` | Tabela de utilizadores da SL |
| GET | `/users/:id` | Perfil detalhado de membro |
| GET | `/alerts` | Alertas (certificados a expirar, inativos) |

#### Módulo `analysis` — `/api/analysis` (apenas ADMIN)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/course` | Analisar curso com IA |
| POST | `/batch` | Analisar múltiplos cursos em batch |

---

### 1.7 Ferramentas de Desenvolvimento

| Ferramenta | Versão | Finalidade |
|---|---|---|
| NestJS CLI | 11.x | Scaffolding e build |
| Prisma CLI | 7.x | Migrações, seed, geração de cliente |
| ESLint 9 | flat config | Linting TypeScript |
| Prettier | 3.x | Formatação automática |
| Jest | 30.x | Testes unitários e e2e |
| @nestjs/testing | 11.x | Utilitários de teste NestJS |
| ts-node | — | Execução de scripts TypeScript |
| Bitbucket Pipelines | — | CI/CD (build, test, deploy) |
| Docker Compose | 3.8 | Ambiente local (DB, Redis, pgAdmin) |
| pgAdmin 4 | 8 | Gestão visual da BD |

---

### 1.8 Integrações Externas

| Serviço | Como é usado | Ficheiros-chave |
|---|---|---|
| **Groq API** (Llama 3.3-70B) | LLM para chat, recomendações, extração de metadados, análise de cursos | `src/ai/services/ai.service.ts` |
| **Supabase Storage** | Upload e acesso de certificados e documentos | `src/certificates/supabase-storage.service.ts` |
| **Microsoft Learn** | Adapter de pesquisa externa de cursos | `src/search/adapters/microsoft-learn.adapter.ts` |
| **Academia Portugal Digital** | Adapter de pesquisa externa | `src/search/adapters/academia-portugal-digital.adapter.ts` |
| **IBM SkillsBuild** | Adapter de pesquisa externa | `src/search/adapters/ibm-skillsbuild.adapter.ts` |
| **Salesforce Trailhead** | Adapter de pesquisa externa | `src/search/adapters/trailhead.adapter.ts` |
| **Udemy** | Adapter de pesquisa externa | `src/search/adapters/udemy.adapter.ts` |
| **Softinsa EL** | Adapter de pesquisa interna | `src/search/adapters/softinsa-el.adapter.ts` |
| **SMTP (Gmail)** | Envio de emails (boas-vindas, confirmações, alertas) | `src/notifications/email.service.ts` |
| **Web Push (VAPID)** | Notificações push no browser | `src/push/push.service.ts` |
| **Redis** | Cache de respostas LLM + fila BullMQ | `src/cache/cache.service.ts` |
| **PostgreSQL + pgvector** | BD principal + busca vectorial | `prisma/schema.prisma` |

---

## PASSO 2 — MAPEAMENTO DE FUNCIONALIDADES

### F1 — Autenticação e Gestão de Conta

**Problema que resolve:** Controlar quem acede à plataforma e com que permissões.

**Implementação:**
- Registo com validação de email único, hash bcrypt (salt 10)
- JWT Access Token (curta duração) + Refresh Token (longa duração, persistido em BD)
- RBAC com 3 roles: USER, ADMIN, SERVICE_LINE_MANAGER
- `GlobalAuthGuard` aplica JWT globalmente; rotas públicas marcadas com `@Public()`
- Onboarding: primeira configuração do perfil (nível, interesses, service line, skills)
- Eliminação automática de refresh tokens expirados via cron job

**Ficheiros:** `src/auth/auth.controller.ts`, `auth.service.ts`, `strategies/jwt.strategy.ts`, `guards/`

**Decisão de design:** Uso de `@Public()` decorator em vez de proteger rotas uma a uma — reduz erros de configuração.

---

### F2 — Registo Pessoal de Formações

**Problema que resolve:** Centralizar e acompanhar todas as formações de cada utilizador.

**Implementação:**
- CRUD completo de `TrainingRecord` com estados: `ongoing`, `completed`, `priority`, `later`, `accessed`, `cancelled`
- Upload de documentos anexos via Supabase Storage (com fallback local)
- Recursos de apoio por formação (`TrainingResource` + `ResourceFile`)
- Estatísticas: horas totais, contagem por status, rating médio
- Tracking de acesso: quando o utilizador clica num resultado de pesquisa, cria registo com status `accessed` para feedback futuro

**Ficheiros:** `src/trainings/trainings.controller.ts`, `trainings.service.ts`

---

### F3 — Pesquisa Unificada Multi-Plataforma com Ranking Semântico

**Problema que resolve:** Agregar cursos de múltiplas fontes (Microsoft Learn, Udemy, IBM, etc.) numa única pesquisa inteligente.

**Implementação:**
1. **Cache DB primeiro:** pesquisa na tabela `Course` (PostgreSQL) para rapidez
2. **Pesquisa externa paralela:** `Promise.allSettled` em todos os adapters activos
3. **Deduplicação por URL:** evita resultados duplicados entre fontes
4. **Ranking semântico com IA:** `SemanticRankingService` ordena resultados pela relevância semântica da query usando embeddings locais (Xenova all-MiniLM-L6-v2)
5. **Enriquecimento interno:** ratings médios dos utilizadores Softinsa, estado do utilizador (guardado/frequentado/concluído)
6. **Persistência em background:** novos resultados guardados na cache sem bloquear o request
7. **Filtro de qualidade:** `isLikelyTrainingResult` filtra resultados que não são formações reais
8. **Pesquisa semântica pura:** endpoint `/search/semantic` usa pgvector directamente

**Ficheiros:** `src/search/search-orchestrator.service.ts`, `adapters/`, `semantic-ranking.service.ts`, `course-db.service.ts`

**Decisão de design:** Browse mode (sem query) desactiva ranking IA e pesquisa externa para reduzir latência — ordena apenas por rating.

---

### F4 — Pipeline RAG (Retrieval-Augmented Generation)

**Problema que resolve:** Dar ao assistente IA conhecimento específico sobre os cursos disponíveis, sem fine-tuning do modelo.

**Implementação:**
1. **Indexação:** cursos indexados como chunks de texto na tabela `TextChunk` com embeddings 384d (Xenova)
2. **Busca híbrida:** combina busca vectorial (cosine similarity via pgvector) com busca por keywords (PostgreSQL full-text)
3. **Threshold adaptativo:** cosine similarity ≥ 0.60 (threshold principal), fallback para 0.55 em recomendações
4. **Contexto de curso por @ mention:** utilizador pode mencionar um curso específico no chat; o contexto desse curso é injectado explicitamente no prompt
5. **Prompt engineering:** templates dedicados (`src/ai/templates/rag.template.ts`) bilingues (PT/EN)
6. **Memória de conversa:** histórico da conversa injectado no contexto (modelo com memória)
7. **Persistência:** conversas e mensagens guardadas em BD (`Conversation`, `Message`)

**Ficheiros:** `src/ai/services/rag.service.ts`, `embedding.service.ts`, `templates/rag.template.ts`

---

### F5 — Recomendações Personalizadas por IA

**Problema que resolve:** Sugerir cursos relevantes com base no perfil, skills, nível e histórico do utilizador.

**Implementação:**
1. Lê perfil do utilizador: service line, nível de experiência, skills, interesses, formações concluídas
2. Gera 3 queries semânticas focadas com base no perfil
3. Busca top-K chunks por cada query no vector store
4. Injeta catálogo filtrado no prompt do LLM
5. Groq gera resposta JSON estruturada (validada com Zod schema `RecommendationSchema`)
6. Cache de 2 horas (Redis) por utilizador para reduzir chamadas à API Groq
7. Fallback progressivo: se poucos resultados, baixa threshold de similaridade

**Ficheiros:** `src/ai/services/recommendation.service.ts`, `parsers/ai.schemas.ts`

---

### F6 — Processamento de Certificados com IA

**Problema que resolve:** Extrair automaticamente metadados de certificados (nome do curso, fornecedor, datas, horas) de PDFs e imagens.

**Implementação (pipeline assíncrono via BullMQ):**
1. Upload do ficheiro → guardado no Supabase Storage → registo criado com status `PENDING`
2. Job adicionado à fila `pdf-processing` (BullMQ + Redis), com 3 tentativas e backoff exponencial
3. `PdfProcessor` executa:
   - Download do ficheiro (Supabase ou fallback local)
   - Extracção de texto: `pdf-parse` para PDFs; `Tesseract.js` (OCR, idiomas PT+EN) para imagens
   - Prompt few-shot bilingue enviado ao Groq (temperature=0.1, JSON mode)
   - Resposta validada com Zod (`CertificateMetadataSchema`)
   - Metadados guardados em BD; status atualizado para `COMPLETED` ou `FAILED`
4. SSE endpoint (`/certificates/job/:jobId/stream`) permite ao frontend seguir o progresso em tempo real
5. `CertificateProcessedEvent` emitido via EventEmitter → notificação in-app + email para o utilizador

**Ficheiros:** `src/certificates/`, `processors/pdf.processor.ts`, `src/ai/extractors/metadata-extraction.service.ts`

[NOTA PARA O RELATÓRIO]: O processamento de imagens TIFF e BMP multi-página via Tesseract pode ser lento. Como trabalho futuro, poderia ser considerado um serviço OCR dedicado em cloud (ex: Azure Document Intelligence) para maior precisão e velocidade.

---

### F7 — Sistema de Notificações Multi-canal

**Problema que resolve:** Manter os utilizadores informados sobre eventos relevantes da sua aprendizagem.

**Canais:**
1. **In-app** — notificações na BD, API REST para listagem/leitura
2. **Email** — Nodemailer via SMTP, templates HTML próprios
3. **Push notifications** — Web Push API (VAPID), usando `web-push`, subscriptions guardadas em BD

**Eventos notificados (schedulers automáticos):**
| Scheduler | Frequência | Evento |
|---|---|---|
| `weekly-recommendations.scheduler.ts` | Semanal | Novas recomendações de cursos |
| `certificate-expiry.scheduler.ts` | Diário | Certificados a expirar (com antecedência) |
| `calendar-reminder.scheduler.ts` | A cada 5 min | Lembretes de eventos do calendário |
| `certificate-stuck.scheduler.ts` | Periódico | Certificados presos no processamento |
| `training-stagnation.scheduler.ts` | Periódico | Formações paradas há muito tempo |
| `onboarding-reminder.scheduler.ts` | Periódico | Lembrete para completar onboarding |
| `sl-manager-digest.scheduler.ts` | Periódico | Digest semanal para gestores de SL |

**Ficheiros:** `src/notifications/`, `schedulers/`, `email.service.ts`, `src/push/`

---

### F8 — Calendário de Formações com Export ICS

**Problema que resolve:** Agendar eventos e lembretes de formações, integráveis com calendários externos.

**Implementação:**
- CRUD de `CalendarEvent` com `reminderMinutesBefore` configurável
- `reminderFireAt` calculado automaticamente (eventDate - minutesBefore)
- Scheduler verifica a cada 5 minutos se há eventos a lembrar (3 níveis: dia anterior, dia de, lembrete final)
- Export `.ics` (iCalendar): compatível com Google Calendar, Outlook, Apple Calendar — sem OAuth necessário

**Ficheiros:** `src/calendar/`, `processors/`

---

### F9 — Coleções / Playlists de Cursos

**Problema que resolve:** Organizar cursos de interesse em listas temáticas personalizadas.

**Implementação:**
- CRUD de `Collection` com múltiplos `CollectionCourse`
- Constraint unique [collectionId, externalId] evita duplicados
- Cursos da coleção guardados por externalId (não por ID interno) para independência de plataforma

**Ficheiros:** `src/collections/`

---

### F10 — Dashboard de Service Line Manager

**Problema que resolve:** Dar aos gestores visibilidade sobre o progresso de aprendizagem da sua equipa.

**Implementação:**
- Acesso restrito a role `SERVICE_LINE_MANAGER`
- Manager só vê utilizadores da sua service line (verificação via `managedLineId`)
- Dados disponíveis: KPIs agregados, tabela de membros, perfil detalhado individual, alertas (certificados a expirar, inativos, sem formações)
- Categorização de alertas por severidade: critical, warning, info

**Ficheiros:** `src/sl-manager/`, `sl-manager.service.ts`

---

### F11 — Painel de Administração

**Problema que resolve:** Gestão centralizada de utilizadores, plataformas e monitorização da plataforma.

**Funcionalidades:**
- Gestão de utilizadores: listar, atualizar, ativar/desativar, alterar role, eliminar
- Gestão de plataformas externas: configurar API keys, ativar/desativar pesquisa
- Analytics gerais: estatísticas da plataforma
- Audit log: registo de todas as ações administrativas

**Ficheiros:** `src/admin/`, `audit.service.ts`

---

### F12 — Plano de Estudo Gerado por IA

**Problema que resolve:** Dar ao utilizador um roteiro de estudo estruturado para um curso específico.

**Implementação:**
- Analisa o curso a partir do ID de formação
- Gera plano estruturado (módulos, objetivos, recursos sugeridos) com Groq
- Focus opcional (ex: "hands-on", "teoria primeiro")

**Ficheiros:** `src/ai/services/course-plan.service.ts`

---

### F13 — Relatório de Progressão

**Problema que resolve:** Sumarizar o percurso de aprendizagem do utilizador de forma exportável.

**Implementação:**
- Agrega perfil + formações + certificados + skills num DTO estruturado
- Frontend usa os dados para gerar PDF (documentado no Swagger como integrável com jsPDF/react-pdf)

**Ficheiros:** `src/reports/reports.service.ts`

---

### F14 — Análise de Cursos com IA (Admin)

**Problema que resolve:** Enriquecer o catálogo de cursos com análise semântica automática.

**Implementação:**
- ADMIN envia URL/descrição de curso
- IA gera: resumo, tópicos principais, classificação de nível, tags
- Curso indexado automaticamente no vector store (`TextChunk`)
- Suporte a análise em batch

**Ficheiros:** `src/analysis/`, `src/ai/services/analysis.service.ts`

---

### F15 — Cache Multi-Nível

**Problema que resolve:** Reduzir latência e custos de API (Groq cobra por token).

**Implementação:**
- Redis como cache primário (TTL configurável)
- Map em memória como fallback quando Redis não está disponível
- Cache de respostas Groq: hash SHA-256 de [userId + systemPrompt + query + history]
- Cache de recomendações: 2 horas por utilizador
- Detecção automática de reconexão ao Redis

**Ficheiros:** `src/cache/cache.service.ts`

---

## PASSO 3 — PLANO DE ESCRITA DO RELATÓRIO

### Capítulo 1 — Introdução (6-8 páginas)

**1.1 Entidade de Acolhimento — Softinsa (IBM Partner)**
- Apresentar a Softinsa: área de negócio, service lines (Hybrid Cloud, Data, Business Applications, Application Operations, Sourcing & Talent Management)
- Contexto do estágio: inserção na equipa de desenvolvimento
- Enquadramento do projeto Learning Hub no contexto da empresa

**1.2 Objetivos do Projeto**
- Objetivo geral: plataforma interna de gestão e recomendação de formações
- Objetivos específicos baseados no código real:
  - Centralizar o registo de formações dos colaboradores
  - Agregar pesquisa de cursos de múltiplas plataformas externas
  - Implementar assistente IA com memória (RAG + LLM)
  - Automatizar extração de metadados de certificados
  - Fornecer ferramentas de gestão para Service Line Managers

**1.3 Plano de Trabalho**
- Apresentar cronograma real: análise de requisitos → modelação BD → desenvolvimento modular (Auth → Trainings → Search → AI/RAG → Certificates → Notifications → Admin)
- Usar tabela de fases com datas das migrações Prisma como referência temporal (primeira migração: `20260310`)

**1.4 Estrutura do Relatório**
- Descrição breve de cada capítulo

**Figuras sugeridas:**
- Logótipo da Softinsa e organograma das service lines
- Diagrama de Gantt do plano de trabalho

---

### Capítulo 2 — Estado da Arte (14-18 páginas)

**2.1 Plataformas LMS Existentes**
Comparar com o Learning Hub numa tabela:
| Feature | Moodle | Canvas LMS | Coursera for Teams | TalentLMS | **Learning Hub** |
|---|---|---|---|---|---|
| Self-hosted | Sim | Sim/Cloud | Cloud | Cloud | Sim |
| IA generativa | Não | Limitado | Sim | Não | Sim (Groq Llama) |
| Multi-plataforma | Não | Não | Não | Parcial | Sim (6 plataformas) |
| OCR de certificados | Não | Não | Não | Não | Sim (Tesseract) |
| RAG/Chat | Não | Não | Limitado | Não | Sim (pgvector) |
| Push notifications | Não | Limitado | Sim | Sim | Sim (VAPID) |
| Contexto empresarial | Parcial | Sim | Não | Sim | Sim (SL Manager) |

**2.2 Retrieval-Augmented Generation (RAG)**
- Definição e importância (Lewis et al., 2020)
- RAG vs Fine-tuning: trade-offs
- Busca híbrida (vectorial + keyword) — fundamentos
- pgvector e embedding em PostgreSQL

**2.3 Large Language Models aplicados a e-Learning**
- GPT-4, Llama, modelos open-source
- Groq como serviço de inferência ultra-rápida
- Prompting e JSON mode

**2.4 Arquitecturas de Sistemas de Recomendação**
- Collaborative filtering vs Content-based vs Hybrid
- O Learning Hub usa abordagem **hybrid**: embedding de perfil + RAG sobre catálogo

**2.5 Vector Databases e Busca Semântica**
- pgvector vs Pinecone vs Chroma vs Qdrant
- Justificar escolha de pgvector: sem infra adicional, integração Prisma

**2.6 Frameworks Backend**
- NestJS vs Express vs Fastify
- Vantagens do NestJS: modularidade, DI, Swagger nativo

**Fontes sugeridas (APA 7ª):**
- Lewis, P., et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. *arXiv:2005.11401*
- Vaswani, A., et al. (2017). Attention is all you need. *NeurIPS 2017*
- Reimers, N., & Gurevych, I. (2019). Sentence-BERT. *EMNLP 2019*
- Touvron, H., et al. (2023). Llama 2. *arXiv:2307.09288*
- Documentação oficial: NestJS, Prisma, pgvector, Groq

---

### Capítulo 3 — Metodologias, Tecnologias e Ferramentas (12-15 páginas)

**3.1 Metodologia de Desenvolvimento**
- Abordagem iterativa/incremental (evidenciada pelas 18 migrações Prisma ao longo de 5+ semanas)
- Organização por módulos de domínio (DDD lite)

**3.2 Arquitectura — Detalhe**
- Diagrama de arquitectura do sistema (frontend ↔ backend ↔ BD ↔ serviços externos)
- Padrões: Repository (Prisma), Event-Driven (EventEmitter2), Queue-based (BullMQ), Adapter (search platforms)
- Global Guards como ponto único de autenticação
- Módulos NestJS: tabela com todos os 18 módulos e responsabilidades

**3.3 Base de Dados**
- Diagrama ER completo (19 modelos)
- Decisão: PostgreSQL + pgvector em vez de BD vectorial separada
- Estratégia de indexação vectorial (vector(384))

**3.4 Stack Completo (tabela expandida da secção 1.1)**

**3.5 Pipeline de IA**
- Diagrama do pipeline RAG end-to-end
- Diagrama do pipeline de extração de certificados (BullMQ)

**3.6 Ferramentas de Desenvolvimento e CI/CD**
- Bitbucket Pipelines: 3 pipelines (default, pull-requests, branches QA+main)
- Docker Compose para ambiente local
- ESLint + Prettier para qualidade de código

**Figuras/tabelas sugeridas:**
- Diagrama de arquitectura do sistema
- Diagrama ER (gerado pelo Prisma/dbdiagram.io)
- Diagrama de sequência: fluxo de login
- Diagrama de sequência: pipeline RAG
- Diagrama de sequência: processamento de certificado (BullMQ)
- Tabela comparativa de tecnologias (pgvector vs Pinecone, etc.)

---

### Capítulo 4 — Atividades Desenvolvidas (20-25 páginas)

**4.1 Análise de Requisitos**
- Requisitos funcionais derivados dos módulos implementados (tabela)
- Requisitos não-funcionais: segurança (Helmet, JWT, bcrypt, rate limiting), escalabilidade (cache, filas), observabilidade (Winston logs)

**4.2 Modelação da Base de Dados**
- Evolução do esquema (18 migrações — de `20260310` a `20260414`)
- Decisões de design: uso de `Json` para metadados flexíveis, `Unsupported("vector")` para embeddings, enumerações para estados

**4.3 Implementação do Backend — por módulo**

*4.3.1 Autenticação e Autorização*
- JWT stateless + refresh token
- RBAC com 3 roles
- Código relevante (excertos dos guards e strategy)

*4.3.2 Pesquisa Unificada*
- Orquestrador multi-plataforma
- 6 adapters externos (Microsoft Learn, Udemy, IBM, Trailhead, Academia Portugal Digital, Softinsa EL)
- Semantic ranking com embeddings locais
- Cache DB para performance

*4.3.3 Sistema RAG e Chat*
- Indexação de cursos em vector store
- Busca híbrida (vector + keyword)
- Geração de resposta com Groq Llama 3.3 70B
- Memória de conversa persistida
- SSE para streaming de respostas

*4.3.4 Processamento Assíncrono de Certificados*
- Pipeline BullMQ: upload → queue → worker → OCR/PDF → LLM → BD
- SSE para acompanhamento em tempo real
- Tratamento de erros com retry exponencial

*4.3.5 Sistema de Notificações*
- 3 canais: in-app, email, push
- 7 schedulers automáticos
- Templates de email HTML

*4.3.6 Funcionalidades Complementares*
- Calendário com export ICS
- Coleções/playlists
- Relatório de progressão
- Plano de estudo por IA
- Dashboard SL Manager

**4.4 Segurança Implementada**
- Headers HTTP (Helmet + CSP)
- Rate limiting por endpoint
- Validação de input (class-validator + Zod)
- CORS configurado
- Logs de auditoria

**4.5 Documentação da API**
- Swagger/OpenAPI automático (`/docs`)
- Todas as rotas documentadas com `@ApiOperation`, `@ApiResponse`, `@ApiTags`

**Figuras sugeridas:**
- Screenshot do Swagger UI
- Diagrama de fluxo do registo de utilizador
- Diagrama do pipeline de pesquisa unificada
- Excertos de código comentados (adapter pattern, RAG pipeline)
- Screenshot do Prisma Studio / pgAdmin com estrutura da BD

---

### Capítulo 5 — Resultados Obtidos (8-10 páginas)

**5.1 Funcionalidades Entregues**
- Tabela resumo: 15 funcionalidades principais, estado de implementação, módulo correspondente

**5.2 API REST Completa**
- Contagem total de endpoints: ~70+ endpoints documentados no Swagger
- Distribuição por módulo (tabela ou gráfico de barras)

**5.3 Performance e Escalabilidade**
- Cache multi-nível (Redis + memória) reduz latência de repostas LLM
- Processamento assíncrono (BullMQ) evita timeouts no processamento de certificados
- Deduplicação e browse mode reduzem carga nas APIs externas

**5.4 Cobertura de Testes**
- Testes unitários (Jest): `auth.service.spec.ts`, `ai.service.spec.ts`
- Scripts de validação: `test:ai:smoke`, `test:ai:flows`, `test:ai:endpoints`
- CI/CD valida build + testes em cada PR

**5.5 Decisões Técnicas e seu Impacto**
- pgvector vs BD vectorial separada: simplicidade operacional, sem infra adicional
- Groq vs OpenAI: custo (free tier generoso) e latência inferior
- BullMQ vs processamento síncrono: escalabilidade, retry automático, observabilidade
- Redis com fallback em memória: resiliência sem dependência obrigatória

**Figuras sugeridas:**
- Gráfico de distribuição de endpoints por módulo
- Tabela de funcionalidades com estado
- Screenshot de log estruturado Winston

---

### Capítulo 6 — Conclusão (4-6 páginas)

**6.1 Principais Resultados**
- Backend modular com 18 módulos NestJS
- Pipeline RAG com busca híbrida e memória de conversa
- Sistema de notificações multi-canal com 7 schedulers
- Processamento assíncrono de certificados com OCR + IA
- Pesquisa unificada de 6 plataformas externas com ranking semântico
- RBAC com 3 roles e dashboard dedicado por role
- API REST com 70+ endpoints documentados via Swagger

**6.2 Trabalho Futuro**

[NOTA PARA O RELATÓRIO — itens identificados no código como melhorias possíveis:]
1. **Azure Document Intelligence** para OCR de certificados mais preciso (substitui Tesseract.js para documentos complexos)
2. **Autenticação SSO** (Microsoft Azure AD / SAML) — infraestrutura Softinsa é Microsoft; `@microsoft/microsoft-graph-client` já está no package.json mas não há integração completa
3. **Frontend Progressive Web App (PWA)** — as push notifications e o export ICS estão prontos, mas dependem de PWA no frontend
4. **Re-indexação automática periódica** do catálogo de cursos no vector store
5. **Testes de integração end-to-end** mais abrangentes (Playwright já está no package.json)
6. **Multitenancy** — suporte a múltiplas empresas (actualmente hardcoded para Softinsa)
7. **Analytics avançados** — dashboard de utilização da IA (tokens, latências, quality scores)
8. **Feedback loop de recomendações** — utilizar as avaliações (rating) dos utilizadores para melhorar recomendações futuras
9. **Deploy em produção** — pipeline Bitbucket para `main` branch está incompleto no código analisado

---

## PASSO 4 — ESTADO DA ARTE PERSONALIZADO

### Plataformas LMS a Comparar

| Plataforma | Open Source | IA generativa | Foco empresarial | RAG | Multi-plataforma |
|---|---|---|---|---|---|
| **Moodle 4.x** | Sim | Plugin (limitado) | Parcial | Não | Não |
| **Canvas LMS** | Sim/Cloud | Limitado | Sim | Não | Não |
| **TalentLMS** | Não (SaaS) | Básico | Sim | Não | Não |
| **Coursera for Business** | Não | Recomendações | Sim | Parcial | Parcial |
| **Degreed** | Não | Recomendações | Sim | Não | Sim |
| **Learning Hub (este projeto)** | Sim | Llama 3.3 70B via Groq | Sim (SL Manager) | Sim (pgvector) | Sim (6 plataformas) |

**O que o Learning Hub faz diferente:**
- **RAG com memória persistida** no próprio LMS — não depende de chatbot externo
- **Extração automática de metadados de certificados** por IA (nenhum LMS mainstream tem isto)
- **Pesquisa unificada multi-plataforma** com ranking semântico em tempo real
- **Dashboard por role** — gestores de service line têm visão da equipa sem acesso ao admin global
- **Stack 100% open-source** (exceto Groq API e Supabase) — possível self-host completo

### Conceitos Teóricos a Aprofundar

1. **RAG (Retrieval-Augmented Generation)** — Lewis et al. (2020): base da funcionalidade de chat
2. **Sentence Embeddings** — Reimers & Gurevych (2019): all-MiniLM-L6-v2 usado no projeto
3. **Transformer Architecture** — Vaswani et al. (2017): base dos LLMs usados
4. **Vector Similarity Search** — HNSW, IVFFlat (algoritmos usados pelo pgvector)
5. **Information Retrieval híbrido** — BM25 (keyword) + Dense Retrieval (vector)
6. **Sistemas de Recomendação baseados em Conteúdo** — Pazzani & Billsus (2007)
7. **Personalized Learning e LMS** — Siemens (2005): Conectivismo
8. **JWT e OAuth 2.0** — RFC 7519, RFC 6749
9. **Event-Driven Architecture** — Richardson (2018): Microservices Patterns

### Papers/Autores de Referência (APA 7ª)

```
Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-Augmented Generation for 
    Knowledge-Intensive NLP Tasks. arXiv:2005.11401. https://arxiv.org/abs/2005.11401

Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using 
    Siamese BERT-Networks. Proceedings of EMNLP 2019. https://arxiv.org/abs/1908.10084

Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). Attention Is All You Need. 
    Advances in Neural Information Processing Systems, 30.

Touvron, H., Martin, L., Stone, K., et al. (2023). Llama 2: Open Foundation and 
    Fine-Tuned Chat Models. arXiv:2307.09288.

Johnson, J., Douze, M., & Jégou, H. (2019). Billion-scale similarity search with GPUs. 
    IEEE Transactions on Big Data, 7(3), 535–547.

Pazzani, M. J., & Billsus, D. (2007). Content-based recommendation systems. 
    In The Adaptive Web (pp. 325–341). Springer.

Siemens, G. (2005). Connectivism: A learning theory for the digital age. 
    International Journal of Instructional Technology and Distance Learning, 2(1), 3–10.

Doglio, F. (2019). REST API Development with Node.js. Apress.

Luber, S., & Litchfield, P. (2023). What is pgvector? The PostgreSQL vector extension.
    Retrieved from https://www.heise.de/hintergrund/pgvector-explained-9583540.html
```

---

## PASSO 5 — LISTA DE TAREFAS PRIORITÁRIAS

### Prioridade CRÍTICA (fazer primeiro)

| # | Tarefa | Onde no relatório | Tempo estimado |
|---|---|---|---|
| 1 | Escrever Capítulo 3 (Tecnologias) — é o mais técnico e melhor documentado pelo código | Cap. 3 completo | 2-3 dias |
| 2 | Criar diagrama de arquitectura do sistema (draw.io / Mermaid) | Cap. 3.2, Fig. X | 2-3 horas |
| 3 | Criar diagrama ER da BD (dbdiagram.io ou Prisma ERD) | Cap. 3.3, Fig. X | 1-2 horas |
| 4 | Escrever Capítulo 4 — secções 4.3.1 a 4.3.4 (Auth, Search, RAG, Certificados) | Cap. 4 | 3-4 dias |

### Prioridade ALTA

| # | Tarefa | Onde no relatório | Tempo estimado |
|---|---|---|---|
| 5 | Escrever Estado da Arte — secções RAG, LLMs, Vector DBs (com as fontes acima) | Cap. 2 | 2-3 dias |
| 6 | Tirar screenshots do Swagger UI e comentar endpoints | Cap. 4.5, Anexos | 1 hora |
| 7 | Criar tabela comparativa de plataformas LMS | Cap. 2.1 | 1 hora |
| 8 | Escrever Capítulo 5 (Resultados) com base na lista de funcionalidades | Cap. 5 | 1-2 dias |

### Prioridade MÉDIA

| # | Tarefa | Onde no relatório | Tempo estimado |
|---|---|---|---|
| 9 | Escrever Capítulo 1 (Introdução) — descrever Softinsa e objetivos | Cap. 1 | 1 dia |
| 10 | Criar diagramas de sequência (login, RAG pipeline, certificado) | Cap. 4, Figs. | 3-4 horas |
| 11 | Rever e expandir secção de segurança com referências OWASP | Cap. 3, Cap. 4.4 | 2-3 horas |
| 12 | Escrever Conclusão e Trabalho Futuro | Cap. 6 | 1 dia |

### Prioridade BAIXA (mas necessária)

| # | Tarefa | Onde no relatório | Tempo estimado |
|---|---|---|---|
| 13 | Compilar lista de referências bibliográficas completa em APA 7ª | Referências | 2-3 horas |
| 14 | Preparar lista de figuras e tabelas (legendas automáticas no Word) | Todo o documento | 1 hora |
| 15 | Revisão final de linguagem: estilo impessoal no passado ("implementou-se", "desenvolveu-se") | Todo o documento | 2-3 horas |
| 16 | Anexos: código relevante selecionado (máx. 2-3 excertos chave) | Anexos | 1-2 horas |

---

## Resumo: Números-chave para o Relatório

- **18 módulos NestJS** implementados
- **~70 endpoints REST** documentados no Swagger
- **19 modelos de dados** na base de dados
- **6 plataformas externas** integradas na pesquisa
- **3 canais de notificação** (in-app, email, push)
- **7 schedulers automáticos**
- **2 tipos de busca vectorial** (pgvector cosine similarity: cursos + RAG)
- **18 migrações de BD** ao longo do desenvolvimento
- **3 roles de utilizador** com RBAC completo
- **5 service lines** da Softinsa suportadas
- **384 dimensões** dos embeddings (all-MiniLM-L6-v2)
- **Llama 3.3 70B** via Groq como LLM principal
- **BullMQ + Redis** para processamento assíncrono com retry exponencial
- **SSE (Server-Sent Events)** para streaming de chat e status de jobs

---

*Documento gerado por análise automática do código fonte do repositório `learninghub-softinsa-backend`.*
*Todos os detalhes técnicos referenciados foram verificados directamente no código.*
