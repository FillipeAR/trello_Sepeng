@AGENTS.md

# ObraFlow

Plataforma de gestão operacional de obras da construção civil. Cada obra percorre uma
esteira de departamentos e todo mundo acompanha em tempo real em que etapa ela está, quem
responde por ela e o que falta — o conceito do rastreamento de pedido do iFood aplicado ao
fluxo interno da construtora. Empresa de referência: Sepeng Engenharia.

A decisão de arquitetura completa está em [ARQUITETURA.md](ARQUITETURA.md). Leia antes de
mexer no núcleo.

---

## A regra que não se quebra

**O fluxo de trabalho é DADO, não código.**

Etapas, campos exigidos, ações, SLAs e os status exibidos ("Obra Ganha", "RH Concluído")
vivem em tabelas versionadas. Inserir um departamento, reordenar etapas ou mudar campos é
editar dado — nunca alterar aplicação.

Consequências práticas, sem exceção:

- **Nunca** escreva `if (status === 'RH')`, `switch (etapa)` ou qualquer constante de etapa
  no código de aplicação. Se você sentiu vontade, o dado está faltando no schema.
- **Nunca** chame `prisma.x.create/update/delete` direto numa rota, página ou action.
  Toda escrita passa por um command handler em `src/modules/*/commands.ts`, que faz sempre:
  autorizar → validar → aplicar → auditar → emitir evento, dentro de uma transação.
- **Nunca** confie na UI para autorização. Ela esconde o botão; quem nega é o command
  handler e o filtro de escopo da query.
- **Nunca** use `eval`/`new Function` para condições de fluxo. Elas vêm do banco e são
  configuradas por usuários. Use o avaliador declarativo em `src/core/workflow/conditions.ts`.
- `src/core/**` é domínio puro: **sem** import de Prisma, Next ou React. É o que o mantém
  testável sem banco.
- Efeito colateral (notificação, e-mail, WhatsApp) **não** sai do command handler. Grave um
  `OutboxEvent` na mesma transação; o worker entrega.
- Versão de fluxo publicada é **imutável**. Obra em andamento fica travada na versão em que
  entrou. Mudança de fluxo = nova `WorkflowVersion`, nunca `UPDATE` na antiga.

---

## Mapa do código

```
src/
  core/                 # domínio puro, testável sem banco
    workflow/engine.ts       ← regra central: transições, validação, SLA, progresso
    workflow/conditions.ts   ← avaliador de condições declarativas
    workflow/types.ts        ← formas puras do fluxo
    rbac/permissions.ts      ← catálogo de permissões + papéis padrão
    rbac/can.ts              ← canReadProject, canActOnStage
    audit/diff.ts            ← diff antes/depois
  modules/
    projects/commands.ts     ← ESCRITA: createProject, executeStageAction, registerProjectUpdate
    projects/queries.ts      ← LEITURA com escopo de permissão aplicado
    projects/components/     ← StageTimeline, DynamicStageForm
    workflow/snapshot.ts     ← carrega WorkflowVersion no formato do engine
    notifications/dispatcher.ts ← worker do outbox
    dashboard/queries.ts     ← agregações e indicadores
  server/
    db.ts                    ← Prisma client (adapter pg) + tipos Tx/JsonValue
    auth.ts                  ← Auth.js v5, credenciais + JWT
    actor.ts                 ← getActor()/requireActor(): identidade + permissões
    audit.ts                 ← writeAudit(tx, ...)
    outbox.ts                ← enqueueEvent(tx, ...) + catálogo DOMAIN_EVENTS
  app/(app)/                 ← rotas autenticadas
prisma/schema.prisma         ← modelo de dados
prisma/seed.ts               ← o fluxo de 8 etapas como dado
scripts/demo-inserir-etapa.ts ← prova que reconfigurar o fluxo não exige código
```

## Comandos

```bash
npx prisma dev --name obraflow   # Postgres local (deixe rodando em outro terminal)
npm run dev
npm test                         # 46 testes de engine e RBAC, sem banco
npm run db:push                  # aplica o schema no dev
npm run db:seed                  # semeia org, papéis, usuários e o fluxo
npm run build
```

Contas de demonstração: `orcamento@`, `diretoria@`, `rh@`, `seguranca@`, `financeiro@`,
`suprimentos@`, `gestor@`, `admin@`, `visualizador@` — todos `@obraflow.com`,
senha `obraflow123`.

## Convenções

- Código, comentários, commits e UI em **português do Brasil**.
- TypeScript strict. Validação de entrada com Zod, no command handler.
- Toda tabela de negócio carrega `organizationId` — multi-tenant desde o dia 1.
- Soft delete (`deletedAt`) nas entidades de negócio. `AuditLog` é append-only.
- Estilo: Tailwind 4 com os tokens de `src/app/globals.css` (`card`, `input`, `label`,
  `btn-primary`, `btn-ghost`, `btn-danger`). Claro e escuro, ambos.
- Datas de `<input type="date">` são "AAAA-MM-DD" e viram meia-noite **UTC** no `Date` —
  em BRT isso volta um dia. Use `parseLocalDate` / `formatDate`, que já tratam isso.
- Mudou o engine ou o RBAC? Teste. Essa parte não vai sem cobertura.

## Armadilhas conhecidas do ambiente

- **Prisma 7 exige driver adapter.** `new PrismaClient()` sem `adapter` estoura. Use sempre
  `src/server/db.ts`.
- **`prisma migrate dev` falha com P1017** no banco local: o servidor do `prisma dev` é
  emulado e não suporta shadow database. No local use `npm run db:push`. As migrations
  reais rodam contra o Neon em produção (`prisma migrate deploy`).
- O projeto é **ESM** (`"type": "module"`). Scripts avulsos rodam com `npx tsx`.
- A pasta tem espaço no nome ("Projeto Trello Sepeng") — cite caminhos entre aspas no shell.

## Estado atual

MVP completo e verificado ponta a ponta: auth, RBAC, engine versionado, fluxo de 8 etapas,
cadastro de obra, formulários dinâmicos, esteira visual, fila do departamento, auditoria,
notificações in-app, dashboards e visualização do fluxo. Build, lint, `tsc` e 46 testes
passando.

Existe um fluxo v2 no banco (com etapa Jurídico) criado pelo script de demonstração, e duas
obras de exemplo.

### Editor visual de fluxos — entregue

`/admin/fluxos` tem o fluxo completo de configuração via dado: "Criar rascunho do fluxo"
clona a versão publicada mais recente para uma `WorkflowVersion` em `DRAFT`
(`src/modules/workflow/commands.ts:createDraftVersion`); a tela em
`/admin/fluxos/[versionId]/editar` cria/edita/remove/reordena etapas, campos e ações
desse rascunho; "Publicar versão" valida (toda etapa não-final precisa de ao menos uma
ação) e promove o rascunho a `PUBLISHED`, arquivando a versão anterior — obras em
andamento continuam travadas na versão em que entraram. Reordenação é por botões
subir/descer (sem lib de drag-and-drop). Command handlers só escrevem em versão `DRAFT`;
versão publicada/arquivada é sempre rejeitada com `CommandError`.

### Etapas paralelas — entregue

Uma etapa com `mode: "PARALLEL"` bifurca ao ser concluída: abre um `StageInstance` por
`WorkflowTransition` válida saindo dela (mesmo `forkId` em `StageInstance`, agrupando os
ramos "irmãos"). Cada ramo evolui de forma independente; a etapa de convergência só abre
quando o `joinPolicy` dela é satisfeito — `ALL` espera todo irmão concluir, `ANY` libera no
primeiro e marca os demais como `SKIPPED` (dispensados). `ProjectWorkflowInstance.currentStageId`
deixou de ser mantido manualmente: é sempre recalculado a partir de quais `StageInstance`
seguem ativas (`null` quando há mais de uma). Engine puro e testado em
`src/core/workflow/engine.ts` (`resolveForkTargets`, `resolveTargets`, `shouldJoin`) +
`engine.test.ts`; orquestração transacional em
`src/modules/projects/commands.ts:executeStageAction`.

**Limitação conhecida**: bifurcar exige `WorkflowTransition` explícitas (uma por ramo) — o
editor visual (`/admin/fluxos`) ainda não tem tela para criar transições, só
`StageAction.targetStageId` (destino único). Por ora, configura-se uma bifurcação via
script, no espírito do `scripts/demo-inserir-etapa.ts` — ver
`scripts/demo-etapa-paralela.ts`, que bifurca Diretoria em RH + Segurança, convergindo em
Financeiro. Rodar num rascunho e publicar como as demais mudanças de fluxo.

### Próximos passos (V1), na ordem sugerida

1. **Upload real de anexos** (Vercel Blob) — hoje o campo `FILE` aceita link/referência.
2. **Comentários com @menção** na tela da obra — modelo `Comment`/`Mention` já pronto.
3. **Escalonamento por SLA vencido** — cron chamando `processOutbox` e gerando
   `sla.breached`.
4. **Paginação por cursor** em `listProjects` (hoje `take: 100`).
5. **Editor de transições** no admin de fluxos — pré-requisito para configurar etapas
   paralelas (e condições) pela tela, sem script.
