# Guia de Contribuição — LearningHub Backend

Obrigado por contribuíres para o projeto! Este documento define as regras e processos para manter a base de código consistente e de qualidade.

---

## Índice

- [Estrutura de Branches](#estrutura-de-branches)
- [Conventional Commits](#conventional-commits)
- [Processo de Pull Request](#processo-de-pull-request)
- [Regras de QA](#regras-de-qa)
- [Setup Local](#setup-local)

---

## Estrutura de Branches

| Branch | Propósito | Deploy automático |
|---|---|---|
| `main` | Código de produção — estável e validado | Sim (produção) |
| `QA` | Ambiente de testes/validação integrado | Sim (QA) |
| `feature/<nome>` | Nova funcionalidade | Não |
| `fix/<nome>` | Correção de bug | Não |
| `chore/<nome>` | Manutenção, dependências, configs | Não |
| `refactor/<nome>` | Refatoração sem alteração de comportamento | Não |

### Regras

- **Nunca fazer push direto para `main` ou `QA`** — toda a alteração entra por Pull Request.
- O nome da branch deve ser descritivo e em minúsculas com hífenes: `feature/recommendation-engine`, `fix/jwt-refresh-token`.
- Apagar a branch após o merge ser aceite.

---

## Conventional Commits

Todos os commits devem seguir o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<âmbito opcional>): <descrição curta>

[corpo opcional]

[rodapé opcional]
```

### Tipos aceites

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Alterações apenas em documentação |
| `style` | Formatação, ponto e vírgula, etc. (sem alteração de lógica) |
| `refactor` | Refatoração de código sem adição de features nem correção de bugs |
| `test` | Adição ou correção de testes |
| `chore` | Tarefas de manutenção (dependências, configs, CI) |
| `perf` | Melhorias de performance |
| `ci` | Alterações nos ficheiros de CI/CD |

### Exemplos

```bash
feat(auth): adicionar refresh token com rotação automática
fix(rag): corrigir limite de chunks na pesquisa semântica
chore(deps): atualizar prisma para v7.4.1
docs(readme): adicionar secção de variáveis de ambiente
test(user): adicionar testes unitários ao UserService
ci(pipelines): adicionar step de validação prisma no QA
```

### Regras

- A descrição deve estar em **português** e no infinitivo: "adicionar", "corrigir", "atualizar".
- A primeira letra é minúscula.
- Sem ponto final na descrição.
- Máximo de 72 caracteres na linha de título.
- Commits com `BREAKING CHANGE:` no rodapé indicam alterações incompatíveis.

---

## Processo de Pull Request

### 1. Criar a branch

```bash
git checkout QA
git pull origin QA
git checkout -b feature/<nome-da-funcionalidade>
```

### 2. Desenvolver e fazer commit

```bash
git add .
git commit -m "feat(módulo): descrição da alteração"
```

### 3. Push e abertura do PR

```bash
git push origin feature/<nome-da-funcionalidade>
```

Abrir Pull Request de `feature/<nome>` → `QA`.

### 4. Checklist antes de abrir o PR

- [ ] O código compila sem erros (`npm run build`)
- [ ] Linting passa sem erros (`npm run lint`)
- [ ] O schema Prisma está válido (`npx prisma validate`)
- [ ] Testes unitários passam (`npm run test`)
- [ ] As variáveis de ambiente necessárias estão documentadas no `.env.example`
- [ ] Não há credenciais, tokens ou dados sensíveis no código
- [ ] A descrição do PR explica o quê e o porquê da alteração

### 5. Revisão de código

- Todo o PR requer **pelo menos 1 aprovação** antes do merge.
- O autor não pode aprovar o próprio PR.
- Resolver todos os comentários antes de fazer merge.
- Usar **Squash and Merge** para manter o histórico limpo.

### 6. Merge para main

O merge de `QA` → `main` é feito pelo tech lead após validação no ambiente de QA.

---

## Regras de QA

### Pipeline automático (Bitbucket Pipelines)

Ao fazer push para `QA`, a pipeline executa automaticamente:

1. `npm ci` — instalação de dependências
2. `npx prisma generate` — geração do cliente Prisma
3. `npx prisma migrate deploy` — aplicação de migrações na BD de QA
4. `npm run build` — compilação TypeScript

**O merge para `QA` só deve avançar se a pipeline passar.**

### Testes manuais em QA

Antes de promover para `main`, validar:

- [ ] Endpoints de autenticação (login, refresh, logout)
- [ ] Fluxo completo de formações (criar, listar, atualizar, eliminar)
- [ ] Upload e download de certificados
- [ ] Pesquisa semântica e recomendações
- [ ] Rate limiting (30 pedidos/min por IP)
- [ ] Documentação Swagger atualizada em `/docs`

### Gestão de migrações

- Toda a alteração ao `schema.prisma` deve ter a correspondente migração gerada.
- Migrações **nunca devem ser editadas manualmente** após serem aplicadas.
- Nomes de migração devem ser descritivos: `npx prisma migrate dev --name add_user_roles`.
- Migrações destrutivas (remoção de colunas/tabelas) requerem aprovação do tech lead.

---

## Setup Local

Ver o [README.md](README.md) para instruções completas de instalação e arranque do projeto.
