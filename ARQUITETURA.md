# ObraFlow — Arquitetura

Plataforma de gestão operacional de obras. O conceito é o rastreamento de pedido do
iFood aplicado ao fluxo interno da construtora: em qualquer momento, qualquer pessoa
vê em que etapa a obra está, quem é o responsável, o que falta e qual o próximo passo.

O documento cobre os oito pontos pedidos no briefing. Onde algo já está implementado,
o caminho do arquivo está indicado.

---

## 1. Arquitetura recomendada

**Modular monolith** em Next.js 16 (App Router), com um núcleo de domínio isolado de
framework. Não microserviços: para dezenas de usuários e centenas de obras, microserviço
só adiciona custo operacional. As fronteiras internas foram desenhadas para que qualquer
módulo possa ser extraído depois sem reescrita.

```
src/
  core/                    # domínio puro — sem Next, sem Prisma, 100% testável
    workflow/              # ← o coração: engine de transições
    rbac/                  # avaliação de permissões
    audit/                 # construção de diffs de auditoria
  modules/                 # um módulo por bounded context
    projects/              # obras: comandos, consultas, componentes
    workflow/              # carregamento de versões do fluxo
    notifications/         # worker do outbox
    dashboard/             # agregações e indicadores
  server/                  # infraestrutura: db, auth, actor, audit, outbox
  app/                     # rotas e UI
```

### Princípios que sustentam o longo prazo

**Toda escrita passa por um Command Handler.** Nenhuma rota chama `prisma.x.update()`
direto. O handler faz sempre a mesma sequência: autorizar → validar → aplicar → auditar →
emitir evento. É isso que garante que nada se perde.
→ [`src/modules/projects/commands.ts`](src/modules/projects/commands.ts)

**Outbox transacional.** O engine nunca envia e-mail nem WhatsApp. Ele grava o evento de
domínio (`stage.entered`, `project.finished`, …) na mesma transação da transição, numa
tabela `outbox_events`. Um worker separado entrega. Plugar um canal novo não toca em
nenhuma regra de negócio.
→ [`src/server/outbox.ts`](src/server/outbox.ts) · [`src/modules/notifications/dispatcher.ts`](src/modules/notifications/dispatcher.ts)

**Multi-tenant desde o dia 1.** Toda tabela de negócio carrega `organizationId`. Hoje roda
com uma empresa; virar SaaS não exige migração dolorosa.

**API interna no formato da API pública.** Server Actions hoje; as mesmas funções de
comando e consulta alimentarão `/api/v1/*` versionada (V2) e o app mobile (V2) sem
duplicação de regra.

---

## 2. Workflow Engine — o núcleo

Máquina de estados **dirigida por dados e versionada**. Nenhuma etapa, departamento ou
status está escrito em código.

| Entidade | Papel |
|---|---|
| `WorkflowDefinition` | O fluxo ("Fluxo Padrão de Obra"). Agrupa versões. |
| `WorkflowVersion` | Snapshot imutável e publicável. Obras em andamento ficam travadas na versão em que entraram. |
| `WorkflowStage` | Etapa. Tem `order`, `departmentId`, `slaHours`, `displayStatus`, `isInitial`, `isFinal`. |
| `StageField` | Campos que a etapa exige, com tipo e obrigatoriedade. É o que torna "Diretoria define gerente e equipe" configurável. |
| `StageAction` | Botões da etapa: avançar, devolver, reprovar, encerrar — cada um com permissão exigida e destino. |
| `WorkflowTransition` | Aresta origem→destino com condição declarativa. |
| `ProjectWorkflowInstance` | A obra dentro do fluxo: etapa atual e versão travada. |
| `StageInstance` | Passagem da obra por uma etapa: entrou quando, saiu quando, por quem, SLA cumprido. |

### Regras de execução

- **`displayStatus` é dado.** "Obra Ganha", "RH Concluído" e "Segurança Liberada" são
  colunas, não constantes. Renomear é um `UPDATE`.
- **Resolução do destino**, em ordem de precedência: transição explícita cuja condição é
  satisfeita → `targetStageId` da ação → próxima etapa por `order`. O caminho linear é o
  padrão, então **reordenar etapas é só mudar `order`**.
- **Condições sem `eval`.** Expressões vêm do banco e são configuradas por usuários;
  um avaliador declarativo interpreta `{ op: "gt", path: "project.contractValue", value: 1000000 }`.
  Operador desconhecido **nega** — nunca libera por omissão.
  → [`src/core/workflow/conditions.ts`](src/core/workflow/conditions.ts)
- **Transação atômica**: fecha a `StageInstance`, abre a próxima, grava auditoria e
  enfileira o evento — tudo ou nada.
- **Etapas paralelas**: uma etapa `mode: PARALLEL` bifurca em vários `StageInstance` (mesmo
  `forkId`) ao avançar; a etapa de convergência libera conforme seu `joinPolicy` — `ALL`
  espera todos os ramos, `ANY` libera no primeiro e dispensa (`SKIPPED`) os demais.

→ [`src/core/workflow/engine.ts`](src/core/workflow/engine.ts) · testes em `*.test.ts`

---

## 3. Modelagem de banco

PostgreSQL, IDs `cuid()`, soft delete (`deletedAt`) nas entidades de negócio.
→ [`prisma/schema.prisma`](prisma/schema.prisma)

**Tenancy e identidade** — `Organization`, `User`, `Membership`, `Department`, `Role`,
`Permission`, `RolePermission`

**Workflow** — `WorkflowDefinition`, `WorkflowVersion`, `WorkflowStage`, `StageField`,
`StageAction`, `WorkflowTransition`

**Obra** — `Project`, `ProjectWorkflowInstance`, `StageInstance`, `StageFieldValue`,
`ProjectTeamAssignment`, `ProjectUpdate`, `Attachment`

**Colaboração e operação** — `Comment` (polimórfico, com thread), `Mention`,
`Notification`, `NotificationPreference`, `Task`, `OutboxEvent`

**Auditoria** — `AuditLog`, append-only:

```
id, organizationId, actorId, action, entityType, entityId,
summary, beforeJson, afterJson, diffJson, ip, userAgent, createdAt
```

Em produção, revogar `UPDATE`/`DELETE` na tabela via `GRANT` — o banco passa a garantir a
imutabilidade, não a disciplina do time.

**Índices críticos** — `(organizationId, status)`, `(organizationId, currentStageId)`,
`StageInstance(stageId, enteredAt)` para SLA, `AuditLog(organizationId, entityType, entityId, createdAt)`.

---

## 4. Fluxo de navegação

```
/login
/dashboard                → indicadores adaptados ao papel
/obras                    → lista com filtros (busca, situação, atraso)
/obras/nova               → cadastro (Orçamento)
/obras/[id]               → esteira estilo iFood + ação da etapa atual
/obras/[id]/historico     → auditoria completa da obra
/minhas-tarefas           → fila do departamento do usuário
/notificacoes
/admin/fluxos             → etapas, campos, ações e versões publicadas
```

A peça central de UX é o **StageTimeline**: cada etapa com estado (concluída / atual /
pendente / devolvida), responsável, tempo decorrido contra o SLA e os campos preenchidos.
→ [`src/modules/projects/components/StageTimeline.tsx`](src/modules/projects/components/StageTimeline.tsx)

O formulário da etapa é gerado a partir da configuração — adicionar um campo novo à
Diretoria não altera nenhum componente.
→ [`src/modules/projects/components/DynamicStageForm.tsx`](src/modules/projects/components/DynamicStageForm.tsx)

---

## 5. Estrutura de permissões (RBAC)

Papéis são **dados** (tabela `roles`), editáveis. As chaves de permissão são código — é o
vocabulário que a aplicação sabe verificar. Formato `recurso:ação[:escopo]`:

```
project:create          project:read:all | :department | :assigned
project:update          project:update:progress
stage:complete          stage:rollback          stage:reject
workflow:read           workflow:manage
user:manage             role:manage             department:manage
audit:read              report:read             comment:create      task:manage
```

Nove papéis são semeados: Administrador, Diretoria, Orçamento, RH, Segurança, Financeiro,
Suprimentos, Gestor de Obra, Visualizador.

**Três escopos de leitura**, do mais amplo ao mais restrito: ver tudo, ver o que passou
pelo seu departamento, ver só as obras em que participa. Ausência de qualquer um nega —
não existe leitura implícita.

**Ação na etapa** exige a permissão da ação **e** pertencer ao departamento dono da
etapa. Quem tem `workflow:manage` destrava qualquer etapa.

A verificação acontece em três camadas: a UI esconde o botão, o command handler nega, e a
consulta filtra por tenant. **A UI nunca é a autoridade.**
→ [`src/core/rbac/can.ts`](src/core/rbac/can.ts) · [`src/core/rbac/permissions.ts`](src/core/rbac/permissions.ts)

---

## 6. Roadmap

**MVP — entregue**
Auth e RBAC · schema completo multi-tenant · workflow engine versionado com testes ·
fluxo de 8 etapas semeado como dado · cadastro de obra · formulários dinâmicos por etapa ·
esteira visual · fila "Minhas tarefas" · auditoria automática · notificações in-app via
outbox · dashboards de Diretoria e Departamento · visualização do fluxo.

**V1 — operação real**
✅ Editor visual de fluxos em `/admin/fluxos` — criar/reordenar etapas, campos e ações pela
tela (`src/modules/workflow/commands.ts`), com rascunho (`DRAFT`) editável e publicação
como nova versão imutável. Reordenação por botões subir/descer, não arrastar-e-soltar —
mesma capacidade, sem dependência de drag-and-drop.

✅ Etapas paralelas — bifurcação e convergência (`ALL`/`ANY`) no engine e no command
handler, com múltiplas `StageInstance` ativas simultaneamente por obra. `scripts/demo-etapa-paralela.ts`
segue como referência de exemplo.

✅ Editor de transições em `/admin/fluxos/[versionId]/editar` — CRUD completo
(`createTransition`/`updateTransition`/`deleteTransition`/`moveTransition`) com destino,
ação de origem opcional e uma condição simples (comparação única, sem `and`/`or`/`not`
aninhados na V1). É o que faltava para configurar bifurcação e roteamento condicional pela
tela, sem script.

✅ Lembretes (`Task`) — pendências pontuais por obra, fora do fluxo formal, com
responsável e prazo opcionais. CRUD em `src/modules/tasks/`, seção na página da obra,
página `/lembretes` (cross-obra) e widget no dashboard. Atribuição notifica só o
responsável via outbox (`task.assigned`).

✅ Campo `STAFF` — tipo de campo alimentado por `Professional`, um cadastro de engenheiros
e encarregados sem login (`/admin/profissionais`), para não obrigar conta de usuário só
pra aparecer em "Gerente responsável"/"Encarregado responsável".

Falta:
escalonamento automático por SLA vencido · upload real de anexos (Vercel Blob) ·
comentários com @menção · registro de progresso com fotos · relatório final de
encerramento · exportação CSV/PDF.

**V2 — escala e integração**
Worker de outbox em Vercel Queues com e-mail (Resend) e WhatsApp (Meta Cloud API) ·
API pública `/api/v1` com OpenAPI e API keys · app mobile (Expo) sobre a mesma API ·
busca global · templates de obra · campos customizados por organização.

**V3 — produto SaaS**
Onboarding self-service multiempresa · billing · permissões por campo · BI (tempo médio
por etapa, produtividade histórica, previsão de gargalo) · chat interno por obra
(WebSockets — o modelo de `Comment` já comporta) · integrações com ERP e Diário de Obra.

---

## 7. Tecnologias

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 16 (App Router, Server Actions) | Um runtime para UI e API; Server Components eliminam metade da camada de estado |
| Linguagem | TypeScript strict | O engine é regra de negócio crítica |
| ORM / DB | Prisma 7 + PostgreSQL | Schema declarativo, migrations versionadas, tipos derivados |
| Banco (dev) | `npx prisma dev` | Postgres local sem Docker |
| Banco (prod) | Neon (Vercel Marketplace) | Serverless, pooling, branches por PR |
| Auth | Auth.js v5 (credenciais, JWT) | SSO plugável depois sem trocar a camada |
| Validação | Zod | Um schema para client, server e API |
| UI | Tailwind 4 | Tokens de tema em CSS puro, claro e escuro |
| Testes | Vitest | Engine e RBAC testados sem banco |
| Deploy | Vercel (Fluid Compute) | Sem `runtime = 'edge'` — Node completo |

---

## 8. Escala para centenas de obras simultâneas

Centenas de obras e dezenas de usuários é carga **modesta**. O risco real não é
throughput — é query mal indexada e N+1. A estratégia:

1. **Índices compostos com prefixo de tenant** em toda consulta quente; nenhuma listagem
   sem limite (hoje `take: 100`; paginação por cursor na V1).
2. **Tabelas de leitura derivadas** para dashboards: `project_stage_metrics` atualizada por
   evento, em vez de agregar a tabela viva a cada carregamento. As agregações atuais são
   diretas e adequadas ao volume do MVP — a fronteira de migração é explícita no código.
3. **Cache Components do Next 16** (`use cache` + `cacheTag`) nos dashboards, invalidados
   por `updateTag` no evento de transição: dado sempre correto, custo baixo.
4. **Auditoria particionada por mês** (`PARTITION BY RANGE (createdAt)`) — é a tabela que
   mais cresce; particionar cedo evita dor depois.
5. **Fluid Compute** + connection pooling do Neon.
6. **Eventos idempotentes**: `OutboxEvent.idempotencyKey` é único, então o worker pode
   reprocessar sem duplicar notificação.
7. **Anexos por URL assinada** direto do Blob, nunca trafegando pela função.

---

## O teste que prova a premissa

A afirmação central — "mudar o fluxo não é mudar código" — é verificável:

```bash
npx tsx scripts/demo-inserir-etapa.ts
```

O script cria a v2 do fluxo com uma etapa **Jurídico** entre Orçamento e Diretoria e
publica. Resultado: obras novas passam a percorrer 9 etapas; a obra que já estava em
andamento continua na v1, com 8 etapas, intacta. Nenhum arquivo de aplicação foi tocado.
