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
- **Permissão nova em `PERMISSIONS`/`PERMISSION_CATALOG` não chega em produção sozinha.**
  `RolePermission` é dado, semeado por `prisma/seed.ts`, que não roda de novo a cada deploy.
  Adicionar uma permissão e dar pra um papel em `DEFAULT_ROLES` só vale localmente até
  alguém rodar a sincronização em produção — use `scripts/sync-permissions.ts` (só
  permissões/papéis, não mexe em usuário/fluxo/dado de negócio) em vez do seed completo.

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

Bifurcar exige `WorkflowTransition` explícitas (uma por ramo) — antes só dava pra criar
via script (`scripts/demo-etapa-paralela.ts`); agora o editor visual também resolve isso
(ver seção seguinte).

### Editor de transições — entregue

Seção "Transições" em cada etapa de `/admin/fluxos/[versionId]/editar` (`StageCard.tsx`),
com CRUD completo (`createTransition`/`updateTransition`/`deleteTransition`/`moveTransition`
em `src/modules/workflow/commands.ts`): destino, ação de origem (ou "qualquer ação") e uma
condição simples (`always`/`eq`/`neq`/`gt`/`gte`/`lt`/`lte`/`in`/`nin`/`isEmpty`/`isNotEmpty`
sobre um único `path`, ex. `project.contractValue`) — monta o JSON avaliado por
`src/core/workflow/conditions.ts`. V1 não expõe `and`/`or`/`not` aninhados (o tipo `Condition`
suporta, mas a UI fica em uma comparação por transição — cobre bifurcação e roteamento
condicional sem precisar de script). `scripts/demo-etapa-paralela.ts` continua valendo como
referência/atalho, mas deixou de ser o único caminho.

### Lembretes — entregue

Pendências pontuais dentro de uma obra, fora do fluxo formal (modelo `Task`, que já
existia no schema e na RBAC — `task:manage` — mas não tinha commands/queries/UI). CRUD em
`src/modules/tasks/commands.ts` (`createTask`/`completeTask`/`reopenTask`/`deleteTask`),
autorização = mesma leitura de obra (`canReadProject`) + permissão `task:manage`. Seção
"Lembretes" em cada obra (`TasksSection.tsx`) e página `/lembretes` com os lembretes
atribuídos a (ou criados por) mim em todas as obras, com destaque para vencidos — mais um
widget "Meus lembretes" no `/dashboard`. Atribuir um lembrete a alguém enfileira
`task.assigned` no outbox e notifica só o responsável (não o departamento inteiro, ao
contrário dos demais eventos) — ver `resolveRecipients` em
`src/modules/notifications/dispatcher.ts`.

### Cadastro de profissionais (engenheiros e encarregados) — entregue

Os campos "Gerente responsável" e "Encarregado responsável" (etapa Diretoria) eram tipo
`USER` — só aceitavam quem tinha login no sistema, forçando criar conta pra cada engenheiro
de campo. Novo tipo de campo `STAFF`, alimentado por um cadastro próprio (`Professional`,
sem relação com `User`/login): `src/modules/staff/` (commands/queries) +
`/admin/profissionais` (permissão `staff:manage`, dada a administrador/diretoria/RH). O
editor de fluxos (`FormPieces.tsx`) já lista "Profissional (engenheiro/encarregado)" como
tipo selecionável; `DynamicStageForm` renderiza como dropdown "Nome — Função" quando o tipo
é `STAFF` — mesmo padrão de armazenar o nome como string que `USER` já usava (sem FK).
`quantidade_funcionarios` continua `NUMBER`, sem mudança.

Versão publicada é imutável — o `seed.ts` já cria fluxos novos com `STAFF`, mas a versão
publicada existente (local ou produção) só passa a usar isso depois de: criar rascunho em
`/admin/fluxos`, editar o tipo dos dois campos e publicar. `DEMO_PROFESSIONALS` no seed é
só para ambiente de demonstração — em produção o cadastro real entra por
`/admin/profissionais`. Produção já foi migrada (v3) via `scripts/migrate-staff-fields.ts`
— o cadastro de profissionais em si começa vazio lá, precisa ser preenchido pela tela.

Esse script também documenta uma pegadinha real do editor de fluxos: `createDraftVersion`
clona a versão publicada campo a campo, ação a ação, com `await` sequencial — contra um
banco remoto (Neon) isso passa fácil do timeout padrão de 5s do Prisma
(`prisma.$transaction`) à medida que o fluxo cresce. Corrigido subindo o timeout desse
comando pra 20s. Se "Criar rascunho do fluxo" começar a falhar/travar em produção outra
vez com fluxos maiores, é o primeiro lugar a olhar.

### Upload real de anexos — entregue

Campo `FILE` agora faz upload de verdade pro Vercel Blob (store `obraflow-anexos`, acesso
**privado** — sem URL pública). `executeStageActionForm`
(`src/app/(app)/obras/actions.ts`) intercepta os campos `FILE` do FormData antes de chamar
o command handler, sobe o arquivo (`put(..., { access: "private" })`, path
`obras/{projectId}/{stageId}/{campo}-{nome}`, limite de 20MB) e grava
`{ url, name, size }` como valor do campo — pro resto do sistema (engine, auditoria) é só
mais um valor de campo, igual antes. Download passa por `/api/anexos` (`src/app/api/anexos/route.ts`),
que reaplica `canActorReadProject` (novo helper em `src/modules/projects/queries.ts`) antes
de buscar o blob — nunca expõe a URL crua do Blob pro cliente. `next.config.ts` sobe o
`serverActions.bodySizeLimit` padrão (1MB) pra 25MB, senão o Next rejeita o upload antes de
chegar no código.

### Comentários com @menção — entregue

Thread de comentários na obra (`entityType: PROJECT`) em `src/modules/comments/`, separada
dos comentários de justificativa que `executeStageAction` já grava por etapa
(`entityType: STAGE_INSTANCE`). @menção **não** é parser de texto — é uma lista de
usuários explícita (`mentionUserIds`), validada contra `Membership` ativa; a UI
(`CommentsSection.tsx`) insere "@Nome" no corpo do comentário quando alguém é selecionado
num `<select>`, só pra manter a convenção visual, mas quem é notificado é sempre a lista
explícita, nunca o texto. Notifica só quem foi marcado (evento `mention.created`, mesmo
padrão pessoal do `task.assigned`).

**Cuidado ao reusar `canActorReadProject`** (`src/modules/projects/queries.ts`): ele usa o
client `prisma` global, então só serve fora de transação (queries, rotas). Dentro de um
`prisma.$transaction`, misturar o client global com a `tx` quebra o protocolo do Postgres
("bind message supplies N parameters...") — foi exatamente o bug que apareceu ao chamá-lo
de dentro do `createComment`. Dentro de uma `tx`, repita o check inline com `tx` +
`canReadProject` (puro), como `tasks/commands.ts` já fazia.

### Escalonamento por SLA vencido — entregue

`vercel.ts` declara um cron (`@vercel/config`, o jeito atual de configurar cron no Vercel —
substitui `vercel.json`) rodando **1x/dia** (11:00 UTC = 08:00 BRT) contra
`/api/cron/sla-check` — frequência conservadora de propósito porque o plano Hobby limita
cron a uma vez por dia; quem estiver no Pro pode apertar isso em `vercel.ts`. A rota chama
`checkSlaBreaches` (`src/modules/notifications/sla.ts`): varre `StageInstance` ativa com
`dueAt` vencido e `slaBreached: false`, marca o flag (idempotência — cada etapa gera o
evento `sla.breached` uma única vez), grava auditoria com `actorId: null` (não tem ator,
é o sistema) e enfileira a notificação pro departamento dono da etapa + equipe da obra
(mesmo `resolveRecipients` genérico do dispatcher). Protegida por `CRON_SECRET`
(`Authorization: Bearer`) — sem ela, a rota aceita qualquer chamada.

Só o **cron** (a notificação) é diário. O painel "SLA vencido" no `/dashboard` é
independente disso e sempre em tempo real — calcula direto do `dueAt` contra `now()`, não
espera a próxima rodada do cron pra aparecer.

`scripts/force-sla-overdue.ts` (dev/teste): força a primeira etapa ativa sem SLA marcado a
ficar vencida, pra testar o cron sem esperar o prazo de verdade passar.

### Paginação por cursor em `listProjects` — entregue

Trocou o `take: 100` sem paginação (obras além da 100ª simplesmente sumiam, sem aviso) por
cursor de verdade: `listProjects` agora recebe `cursor`/`limit` e devolve
`{ items, nextCursor }` — `nextCursor` é o id da última obra da página, usado como cursor
da próxima. `stageKey` foi pro `WHERE` do Prisma (antes era filtro em memória, incompatível
com paginação); `onlyLate` continua em memória de propósito (depende de `isSlaBreached`,
regra do engine — jogar isso pro SQL duplicaria lógica), então uma página pode voltar com
menos itens que o `limit` mesmo havendo mais resultados — o cursor segue avançando certo,
só o preenchimento por página fica irregular nesse filtro específico.

`/obras` (`src/app/(app)/obras/page.tsx`) ganhou "Página anterior"/"Próxima página" — pilha
de cursores visitados via querystring (`back=`, comma-separated), sem `OFFSET` e sem client
JS. **Achado durante o teste**: strings vazias são falsy em JS — usar `""` tanto pra
"primeira página" quanto pra "sem valor" quebrava o link de voltar (o parâmetro sumia da
URL, ou o `href` inteiro virava `""` e a checagem `href ? ... : null` escondia o link à
toa). Resolvido com um marcador não-vazio (`"_"`) pra página 1 na pilha, e `buildQuery`
sempre prefixando com `/obras` em vez de devolver string vazia quando não há filtro nenhum.

`listMyQueue` (fila de departamento, usa `listProjects` por baixo) não pagina — busca um
lote generoso (`limit: 300`) de uma vez, contexto interno onde isso é aceitável.

### Próximos passos (V1)

Todos os itens do roadmap inicial (upload de anexos, comentários com @menção,
escalonamento por SLA, paginação por cursor) estão entregues. Próximos candidatos,
sem ordem definida: paginação/filtros mais ricos nas outras listagens (`/lembretes`,
auditoria), export CSV/PDF, e o que a Sepeng priorizar no uso real.
