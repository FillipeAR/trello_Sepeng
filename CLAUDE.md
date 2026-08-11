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
npm test                         # 93 testes de engine, RBAC e equipe da obra, sem banco
npm run db:push                  # aplica o schema no dev
npm run db:seed                  # semeia org, papéis, usuários e o fluxo
npm run build
```

Contas de demonstração: `orcamento@`, `diretoria@`, `rh@`, `seguranca@`, `financeiro@`,
`gestor@`, `admin@`, `visualizador@` — todos `@obraflow.com`, senha `obraflow123`. Etapa
Suprimentos foi removida do fluxo (ver seção abaixo), então `suprimentos@` não tem mais
etapa própria pra atuar. Orçamento também tem duas contas nomeadas reais (Erika e Thaina,
`erika.orcamento@sepeng.com.br`/`thaina.orcamento@sepeng.com.br`) com senha própria gerada
— não é a senha pública de demonstração, não fica documentada aqui.

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
notificações in-app (e-mail via Resend pra seleção de profissional), dashboards, visualização
do fluxo, gestão de usuários, Jornal Sepeng e Estrutura da Equipe da Obra (canvas com
drag-and-drop). Build, lint, `tsc` e 93 testes passando.

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

### Gestão de usuários (`/admin/usuarios`) — entregue

Antes só existia um login compartilhado por setor (`orcamento@obraflow.com` etc.), semeado
pelo `prisma/seed.ts` — não havia tela nenhuma pra criar mais contas. `PERMISSIONS.USER_MANAGE`
já existia no catálogo (concedida só a `administrador`) mas nunca tinha sido usada por uma UI.
`src/modules/users/` (commands: `createUser`/`updateUser`/`setUserActive`, hash de senha com
`bcryptjs` — mesmo padrão do seed) segue exatamente o esqueleto de `staff/commands.ts` +
`/admin/profissionais`. `setUserActive` desativa por `Membership.isActive`, nunca apaga o
`User` (preserva histórico/auditoria já ligados a ele) — e um administrador não consegue
desativar a própria conta. Cada setor agora pode ter quantas contas nomeadas quiser.

### Valor de contrato restrito a Orçamento/Diretoria — entregue

Primeiro padrão de **redação de campo** no código (não existia nenhum antes — `contractValue`
sempre apareceu cru pra qualquer papel que lesse a obra). Nova
`PERMISSIONS.PROJECT_READ_CONTRACT_VALUE`, concedida por padrão a `administrador`, `diretoria`
e `orcamento`. `canReadContractValue` (`src/core/rbac/can.ts`) é checada em
`src/modules/projects/queries.ts` (`listProjects`/`getProjectDetail`): sem a permissão,
`contractValue` volta `null` em vez do valor — UI mostra "—" na listagem e "Restrito" no
detalhe. **De propósito não mexe** em `measurements/queries.ts` (usa o valor de contrato bruto
pra calcular o resumo de medição — % do contrato executado — pra Financeiro/Diretoria; redigir
ali quebraria esse indicador sem ter sido pedido) nem no contexto de condição do engine
(`executeStageAction` usa `Number(project.contractValue)` pra avaliar condições de transição
de fluxo — é cálculo interno do sistema, não exibição).

### E-mail ao selecionar um Profissional (STAFF) — entregue

`Professional` ganhou `email` opcional (`/admin/profissionais`). Corrigido um problema de base
pra isso funcionar: o campo `STAFF` (ex. "Gerente responsável" da etapa Diretoria) guardava
o **nome** do profissional como string solta em `StageFieldValue.value` — frágil (nomes podem
repetir ou mudar). Agora guarda o **id** (`DynamicStageForm.tsx`, só o `case "STAFF"` — `USER`
continua como estava). `scripts/migrate-staff-field-values.ts` converteu os dados já
existentes (casa por nome dentro da mesma organização, loga o que não achar). Pontos de
exibição do valor (esteira da obra) resolvem o id de volta pra "Nome — Função" em
`getProjectDetail` — a auditoria (`/obras/[id]/historico`) continua mostrando o valor bruto,
de propósito (é um log técnico genérico, não vale a pena diferenciar por tipo de campo ali).

Novo evento `DOMAIN_EVENTS.STAFF_ASSIGNED` ("staff.assigned"), enfileirado por
`enqueueStaffAssignedEvent` (`src/modules/staff/notify.ts`) sempre que um campo STAFF muda de
profissional em `executeStageAction`. Como `Professional` não tem login, esse evento **não**
segue o fluxo genérico de `Notification` in-app (que exige `userId`): o dispatcher
(`dispatchStaffAssignedEmail` em `src/modules/notifications/dispatcher.ts`) resolve o
`professionalId` do payload e manda e-mail direto, sem passar pela preferência opt-in por
usuário (que só existe pra quem tem conta) — se não tiver e-mail cadastrado, não faz nada.

Infra de e-mail nova: `src/modules/notifications/email.ts` (`sendEmail`, mesmo formato do
`whatsapp.ts`) via **Resend** (`npm install resend`, credencial `RESEND_API_KEY`). **Ainda não
provisionado neste ambiente** — a Vercel CLI não estava instalada; provisionar com
`vercel integration add resend` (categoria `messaging` do Marketplace) e `vercel env pull`
antes de e-mails saírem de verdade em produção. Sem a credencial, o envio falha, o erro é
logado e o evento mesmo assim é marcado `DONE` (mesmo padrão de "falha no WhatsApp não
derruba o evento" que `dispatchWhatsApp` já tinha) — não existe retentativa nem fila
travada por causa disso. Não precisou de cron novo: `processOutbox()` já roda de forma
síncrona logo após cada ação (`obras/actions.ts`), então o aviso sai quase na hora.

### Organograma editável — implementado e depois revertido

Chegou a existir uma tela `/admin/organograma` (template de cargos em árvore) + seção na
página da obra pra atribuir profissional por cargo, incluindo um diagrama visual em CSS puro
(caixas conectadas, no estilo do organograma de referência da Sepeng). A Sepeng decidiu não
seguir com a feature — removida por completo: código (`src/modules/orgchart/`,
`OrgChartSection.tsx`, entrada de nav), modelos `OrgChartPosition`/`ProjectOrgChartAssignment`
(migration `20260807140000_drop_orgchart`, dado de teste apagado local e produção) e o CSS
`.orgchart-*` de `globals.css`. Os campos "Gerente responsável"/"Encarregado responsável" da
etapa Diretoria, que tinham sido removidos por ficarem redundantes com o organograma
(`scripts/remove-diretoria-staff-fields.ts`), voltaram
(`scripts/restore-diretoria-staff-fields.ts`) — é o único lugar que registra quem é
gerente/encarregado de uma obra agora. O evento `staff.assigned`/e-mail de seleção (seção
anterior) continua existindo, só perdeu o segundo ponto de disparo (a atribuição do
organograma) — hoje dispara só a partir do campo STAFF da etapa.

### Jornal Sepeng — entregue

Aba "Jornal Sepeng" — primeira entrada da navegação, visível a todo mundo, sem gate de
permissão pra leitura. Nova `PERMISSIONS.NEWS_MANAGE`, concedida por padrão a `administrador`
e `diretoria`, exigida só pra publicar/editar/remover (`src/modules/news/`, mesmo padrão
`commands.ts`/`queries.ts` dos outros módulos administráveis). Notícia é título + texto +
imagem de capa opcional, via upload real pro Vercel Blob — mas com `access: "public"` (ao
contrário dos anexos de obra, que são privados): é conteúdo institucional, não documento
sensível, então a UI referencia a URL do blob direto no `<img>`, sem o proxy de download que
`/api/anexos` usa. `/jornal` não pagina (`take: 30`), mesmo pragmatismo do resto do sistema
pra listas que não costumam crescer descontroladamente.

### Estrutura da Equipe da Obra — entregue

Segunda tentativa de organograma depois da que foi revertida (seção acima) — desta vez por
**obra** (não é template compartilhado) e com canvas de arrastar-e-soltar de verdade, em
`/obras/[id]/equipe`. Primeira lib de canvas/DnD do projeto: `@xyflow/react` (React Flow) —
só pro motor (posição/pan/zoom/edges/mini-mapa); o nó é 100% customizado
(`PositionNode.tsx`) com as classes e tokens já existentes (`.card`, `--primary`, `--border`
etc.), tema do canvas em `globals.css` (`.team-canvas`) mapeando as variáveis `--xy-*` do
React Flow pros tokens do app — sem cor nova.

Modelo `TeamPosition` (`src/modules/team/`): árvore via `parentId`, cada obra com a própria
estrutura. "Nível hierárquico" do inspetor **não é campo** — é sempre a profundidade
calculada na árvore (`flattenWithDepth`), pra não abrir brecha de inconsistência com o pai
real. `permissions` (checklist "Financeiro", "Documentos" etc.) é só exibição — não bloqueia
nada, RBAC real continua sendo só por papel. `Professional` ganhou `avatarUrl`/`company`/
`area` pro modal de pessoa; a tela antiga `/admin/profissionais` não edita esses três campos,
então carrega os valores atuais em campos ocultos ao salvar, pra não zerar o que foi
preenchido na tela nova (achado durante a implementação — sem isso, salvar por
`/admin/profissionais` apagava foto/empresa/área de quem já tinha).

Interações do canvas: arrastar pessoa do painel direito solta no cargo (Drag and Drop HTML5
nativo, sem lib extra — mesmo truque que os exemplos oficiais do React Flow usam pra
"sidebar → canvas"); arrastar uma conexão de um cargo pra outro reatribui o "Superior"
(`onConnect`, valida ciclo no cliente com `wouldCreateCycle` e de novo no servidor); mover um
nó persiste a posição (`positionX`/`positionY`) ao soltar. **Achado que se repetiu de uma
feature anterior** (o mesmo bug do seletor do organograma removido): manter `nodes`/`edges`
do React Flow sincronizados com os dados do servidor via `useEffect` + `setState` dispara o
lint (`react-hooks/set-state-in-effect`) e é o padrão errado — a correção foi computar uma
`key` a partir do conteúdo de `positions` (`TeamCanvas`) e deixar o React remontar
`TeamCanvasInner` do zero quando o dado muda de verdade, em vez de sincronizar por efeito.

Toggle "Organograma"/"Lista" (`TeamListView.tsx`, tabela simples) e "Recolher tudo" (esconde
nós que não são raiz) reaproveitam a mesma árvore. Fora do escopo desta rodada, de propósito:
botão "Exportar" (sem formato definido), responsivo com drawers em mobile/tablet (mockup
prioriza desktop), colapsar nó individual (só "tudo" por enquanto).

**Template pronto** (`src/modules/team/templates.ts` → `SEPENG_DEFAULT_TEMPLATE`): botão
"Usar organograma padrão" no canvas cria de uma vez a estrutura do organograma de referência
da Sepeng/BYD (3× Diretor → Gerente de Contrato → Gerente de Produção/Engenharia →
departamentos → sub-cargos, 19 cargos) numa obra, via `applyTemplate`
(`src/modules/team/commands.ts`) — chama `createPosition` de verdade pra cada nó, então o
resultado é exatamente como ter criado à mão: 100% editável depois. Se a obra já tiver
cargos, confirma antes (soma por cima, não apaga o que já existe).

**Campos redundantes removidos da etapa Diretoria de vez**: "Gerente responsável",
"Encarregado responsável" e "Equipe necessária" saíram do formulário da etapa
(`scripts/remove-diretoria-team-fields.ts`, mesmo padrão de draft+publish das migrations de
fluxo anteriores) — a Equipe da Obra é agora o único lugar que registra quem faz parte do
time, e fica visível (leitura, sem precisar de `staff:manage`) pra qualquer um que possa ler
a obra, em qualquer etapa do fluxo — não só a Diretoria. "Quantidade de funcionários" e
"Recursos necessários" continuam no formulário (não são sobre "quem", são planejamento).

### Simplificação de Orçamento e remoção de Suprimentos — entregue

Dois ajustes no fluxo padrão, na mesma migração (`scripts/simplify-workflow-orcamento-suprimentos.ts`):
etapa Orçamento perdeu os campos "Documentos do contrato" e "Observações do orçamento" —
o valor de contrato (o que importa de verdade) é campo do cadastro da obra, não da etapa,
e continua intocado; e a etapa Suprimentos foi removida por completo. `deleteStage`
bloqueia exclusão enquanto alguma `StageAction.targetStageId` ainda aponta pra etapa — a
ação "avancar" de Financeiro já usava `targetStageId: null` (cai no fallback "próxima
etapa por `order`" do engine), então a remoção não precisou reapontar nada, só excluir e
deixar o engine recalcular a ordem. Fluxo local ficou com 8 etapas.

### Contas nomeadas em Orçamento (Erika e Thaina) — entregue

Primeiro setor a sair do login único compartilhado: duas contas reais criadas via
`createUser` (`scripts/create-orcamento-users.ts`), e-mails temporários
(`erika.orcamento@sepeng.com.br`/`thaina.orcamento@sepeng.com.br` — trocar pelos e-mails
reais depois em `/admin/usuarios`, assim que existirem) e senha única gerada por conta
(16 caracteres, nunca a senha pública `obraflow123`). Outros setores continuam no login
compartilhado por enquanto — não é um padrão que se espalhou sozinho pros demais.

### Lembrete sem data — entregue

Campo de prazo (`dueAt`) saiu do formulário "Novo lembrete" (`TasksSection.tsx`) — o
lembrete conta como "enviado" no momento de criar (`processOutbox()` já rodava logo após
`createTask`, então a notificação já saía quase na hora antes disso também). `dueAt`
continua existindo no schema e no `Task` (lembretes antigos que já tinham prazo continuam
mostrando "vencido" normalmente) — só não tem mais como definir um novo.

### Diretoria vira redirect pro canvas — entregue

Depois que uma obra chega em Diretoria, a única exigência agora é montar a equipe no
canvas (`/obras/[id]/equipe`) — o formulário da etapa (campos "Quantidade de funcionários"
e "Recursos necessários") foi removido de vez. Implementado como atributo **genérico e
versionado** em `WorkflowStage`, não um `if (stage.key === 'diretoria')`:

- `completionMode: "FORM" | "EXTERNAL"` (default `FORM`) + `externalCompletionPath`
  (sub-rota sob `/obras/{projectId}/`, ex. `"equipe"`) + `externalCompletionLabel` (texto
  do botão). `src/core/workflow/types.ts`/`engine.ts` só carregam esses 3 campos como
  dado de passagem — nenhuma lógica de transição muda.
- Etapa com `completionMode: "EXTERNAL"` troca `DynamicStageForm` por
  `ExternalCompletionPanel` (`src/modules/projects/components/`) na página da obra: um
  botão pro `externalCompletionPath` + qualquer ação que não seja `ADVANCE` (ex.
  "Devolver") continua disponível ali mesmo, sem regressão.
- `getPendingExternalCompletion` (`src/modules/projects/queries.ts`) é a ponte genérica:
  dado `projectId` + uma rota, acha se existe etapa ativa em modo EXTERNAL apontando pra
  ali que o ator atual tem permissão de executar (reaproveita `getAvailableActions`, mesma
  autorização de sempre). `/obras/[id]/equipe` chama isso com `"equipe"` — não sabe que
  "normalmente" é a Diretoria.
- Botão "Enviar equipe" no canvas (`TeamPageShell.tsx`) só habilita com pelo menos um
  cargo ocupado (`positions.some(p => p.professionalId)`). Chama `executeStageActionForm`
  **direto** (mesmo padrão "Direct" de `assignProfessionalDirect`/`deletePositionDirect`
  já usado nesta tela), não via `useActionState` + `<form>`.

**Achado real durante a implementação**: com `useActionState`, o sucesso da ação faz o
Next revalidar a rota atual automaticamente — no próximo render do servidor,
`getPendingExternalCompletion` já não acha mais etapa pendente (Diretoria virou
`COMPLETED`), `pendingCompletion` fica `null` e o botão desmonta. Isso competia com o
`useEffect` que dispararia o toast/redirect, e o desmonte vencia a corrida — toast e
redirecionamento simplesmente nunca aconteciam, sem erro nenhum no console. Resolvido
chamando a Server Action direto no `onClick` (não bind por `<form>`): o aviso de sucesso
roda na sequência do próprio clique, sem depender do componente continuar montado depois.

Editor visual (`StageCard.tsx`) ainda não tem controles pra configurar `completionMode`
por clique — só ganhou os 3 inputs ocultos necessários pra não resetar o valor da
Diretoria ao salvar qualquer outro campo da etapa (mesma classe de bug já vista com
`company`/`area`/`avatarUrl` do cadastro de profissionais). Configurar isso noutra etapa
hoje exige script, igual `mode`/`joinPolicy` de bifurcação exigiam antes do editor
alcançar — fast-follow natural, não bloqueou esta entrega.
`scripts/enable-diretoria-external-completion.ts` é a migração que ligou isso pra
Diretoria (e removeu os dois campos do formulário dela).

### Auditoria de segurança (acesso) — levantamento feito, sem mudança de código

A pedido, foi feito um levantamento (não uma correção) de: sessão via JWT do Auth.js
(stateless — login simultâneo em quantos dispositivos quiser, sem visibilidade nem forma
de derrubar uma sessão específica sem trocar `AUTH_SECRET` pra todo mundo); senha mínima
de 8 caracteres sem exigência de complexidade, bcrypt custo 10, sem expiração/reuso;
nenhum rate limiting no login (ponto de maior risco real — sem lib tipo Arcjet/Upstash);
sem `maxAge` de sessão configurado (cai no padrão de 30 dias do NextAuth); sem fluxo de
"esqueci minha senha" (reset só via admin em `/admin/usuarios`); verificação de e-mail não
se aplica — não existe cadastro próprio, toda conta nasce criada por um admin. Nada disso
foi alterado ainda — fica registrado pra priorização futura.

### Rate limiting de login + cadastro próprio — entregue

Fecha duas das lacunas do levantamento de segurança acima (rate limiting e "sem jeito de
criar conta sozinho"), na mesma rodada.

**Rate limiting**, direto no Postgres (sem Redis/serviço externo — `LoginAttempt`,
`src/modules/auth/rate-limit.ts`): janela de 15 min, 5 falhas bloqueiam a mesma conta, 20
falhas bloqueiam a mesma origem (IP, via `x-forwarded-for` — mais frouxo, um escritório
inteiro pode compartilhar IP/NAT). Toda tentativa é gravada, sucesso ou falha — inclusive
a que é recusada só pelo próprio rate limit, senão dava pra continuar tentando contra
e-mails que nem existem sem nunca contar pro limite. `src/server/auth.ts` (`authorize`)
chama isso antes de checar a senha e lança `RateLimitedSignin`/`EmailNotVerifiedSignin`
(subclasses de `CredentialsSignin` do Auth.js v5, cada uma com um `code` próprio) pra
`loginAction` (`src/app/login/actions.ts`) devolver mensagem específica em vez do genérico
"e-mail ou senha incorretos".

**Cadastro próprio** (`/cadastro`, `src/modules/auth/commands.ts:signUp`) — aberto a
qualquer e-mail, mas a conta só entra depois de **duas** aprovações:

1. Confirmar o e-mail (`User.emailVerifiedAt`, `EmailVerificationToken` — link de 24h,
   uso único, `/verificar-email/[token]`).
2. Um admin ativar em `/admin/usuarios` (`Membership.isActive`, mesmo toggle
   `setUserActive` de sempre — zero mudança nele).

Conta nasce com o papel `visualizador` (só leitura, já existia em `DEFAULT_ROLES`) — é o
único papel que faz sentido pra alguém que ainda não foi verificado por humano nenhum.
`signUp` não tem `actor` (quem cria a própria conta ainda não tem identidade) — auditoria
grava com `actorId: null`, mesmo padrão do cron de SLA. Organização é resolvida por
`findFirstOrThrow()` (hoje só existe a Sepeng — mesma simplificação pragmática que todo
script de migração desta base já assume).

**Conta criada por admin (`createUser`) passa a nascer com `emailVerifiedAt` já
preenchido** — um admin que cadastra alguém já está vouching pelo e-mail, exigir
confirmação depois não faria sentido. Isso também é o que evita quebrar login das contas
já existentes: `scripts/backfill-email-verified.ts` preenche `emailVerifiedAt` de toda
conta anterior à mudança (rodado local e produção) — sem isso, ninguém (nem admin@) logava
mais depois do deploy.

Dois eventos novos no outbox, mesmo padrão do `staff.assigned` (dispatch dedicado, não
segue o `resolveRecipients` genérico por obra): `email_verification.requested` (e-mail via
Resend, link de confirmação) e `signup.pending_approval` (notificação in-app pra todo
mundo com `user:manage`, disparada só depois do e-mail confirmado — não faz sentido avisar
admin de um cadastro que a própria pessoa pode nunca confirmar).

**Cadastro não tenta logar sozinho** ao final: mostra uma mensagem fixa
("verifique seu e-mail... depois aguarde aprovação") em vez de chamar `signIn`. Motivo:
`getActor()`/`requireActor()` já checam `Membership.isActive` (não mudou nada ali) — se o
cadastro tentasse logar automaticamente, a pessoa cairia num bounce estranho
(login "funciona", mas todo `requireActor()` manda de volta pro `/login`) antes mesmo do
e-mail estar confirmado. Descoberto e evitado durante o teste, não em produção.

`NEXT_PUBLIC_APP_URL` é opcional — sem ela, `src/lib/url.ts` cai em
`VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` (injetadas automaticamente pela Vercel) ou
`localhost:3000` em dev, pra montar o link absoluto do e-mail de confirmação.

### Feed de atualizações da obra, aviso de Obra Ganha e Jornal Sepeng dirigido — entregue

Quatro pedidos relacionados de uma vez: (1) setores acompanharem a obra sem depender de quem
foi notificado originalmente, (2) e-mail avisando a empresa quando uma obra é ganha, (3) o
Jornal Sepeng ganhar post automático ao atingir marcos do fluxo, (4) esse post ser avisado
por e-mail pra quem quiser. Levantamento prévio + validação de plano por agente dedicado
antes de mexer em código (schema mexia em 4 pontos diferentes).

**"Contato entre setores" virou um feed narrado pelo sistema, não chat.** O pedido original
usava essa expressão mas, esclarecido com o usuário, o que fazia sentido era o próprio
ObraFlow narrando automaticamente tudo que acontece na obra — não pessoas conversando (isso
já existe, é `CommentsSection`/@menção). `ActivityFeed` (nova seção "Atualizações" na página
da obra, `src/modules/projects/components/ActivityFeed.tsx`) lista todo `OutboxEvent` da
obra, narrado por `describe()`. Achado de arquitetura: `resolveRecipients` (departamento
dono da etapa + equipe alocada) sempre foi mais estreito que `canReadProject` — ou seja,
quem lê a obra hoje já podia, em tese, ver mais do que era notificado; o feed só preenche
essa lacuna com uma query nova (`listProjectActivity`, `src/modules/projects/activity.ts`),
sem tocar em `resolveRecipients` (que continua controlando só push/WhatsApp/in-app).
`OutboxEvent` ganhou coluna `projectId` (antes só existia dentro do `payload` Json, sem
índice) pra essa query não precisar varrer Json.

**`describe()` saiu do dispatcher e virou função pura em `src/core/notifications/describe.ts`**
(com teste próprio, `describe.test.ts`) — reaproveitada pelo feed e pelo post automático do
Jornal, além do worker de notificação in-app que já a usava. `DOMAIN_EVENTS` também migrou
pra `src/core/notifications/events.ts` (antes vivia em `src/server/outbox.ts`, que faz
`import type` de `db.ts`/Prisma) — `describe()` é `core` de verdade e não podia depender de
`src/server/**`; `outbox.ts` agora reexporta de lá pra não quebrar nenhum import existente.

**E-mail de "Obra Ganha"**: nova `PERMISSIONS.RECIPIENTS_MANAGE` (`recipients:manage`),
cadastro simples em `/admin/avisos-externos` (`src/modules/recipients/`, clonado do
esqueleto de `staff/`/`Professional` — sem relação com `User`) — lista curada por admin,
não é opt-in. Dispara em `PROJECT_CREATED` (evento de ciclo de vida, não amarrado a etapa
nenhuma — mesmo se o nome/`displayStatus` da etapa inicial mudar, continua funcionando),
incondicional, mesmo padrão de `dispatchStaffAssignedEmail`.

**Jornal automático em marcos**: `WorkflowStage` ganhou `postsToJournal` (campo de passagem
versionado, mesmo padrão de `completionMode`) — quando uma etapa marcada é aberta
(`executeStageAction` ou `createProject`, pra cobrir a etapa inicial), enfileira
`stage.milestone_reached`; o dispatcher chama `createAutoNewsPost` (`src/modules/news/commands.ts`),
que **não** é o mesmo command do post manual — quem avança uma etapa de RH/Segurança
normalmente não tem `news:manage`, e a regra do projeto já obriga o efeito colateral a
nascer fora do command handler que mudou o estado da obra, no worker do outbox.
`NewsPost.sourceEventId` (único) segura a idempotência: se o worker reprocessar o mesmo
evento (retry antes de marcar `DONE`), não duplica o post. `scripts/enable-journal-milestones.ts`
liga o flag nas etapas `isInitial`/`isFinal` do fluxo publicado (marco natural de qualquer
fluxo, sem hardcode de `key`) — outras etapas exigem script à parte por enquanto, mesmo
status de `completionMode` no editor visual.

**Jornal por e-mail, opt-in**: `createNewsPost` (manual) e `createAutoNewsPost` (automático)
enfileiram `news.published`. Canal `EMAIL` entrou em `NotificationPreference` — mas **não**
foi pra matriz genérica de `/notificacoes` (`CONFIGURABLE_CHANNELS`), que já tinha um "toggle
enganoso" discreto pra 3 eventos de conta sem dispatcher de e-mail nenhum; colocar EMAIL lá
teria espalhado esse problema pras ~13 linhas restantes. Em vez disso, `newsEmailEnabled` é
um campo dedicado em `MyNotificationSettings`, com seção própria na UI
(`NewsEmailPreference.tsx`, ao lado de `WhatsAppPreferences`). Dispatcher pro e-mail do
Jornal (`dispatchNewsEmail`) não usa `resolveRecipients` (escopado a obra, e Jornal é
org-wide) nem cria `Notification` in-app (`/jornal` já é a superfície "pull").

**Dois achados de correção aproveitados na mesma rodada**, ambos fora do pedido original mas
descobertos mexendo no código adjacente: `createDraftVersion` (clonagem de rascunho no
editor de fluxos) esquecia de copiar `completionMode`/`externalCompletionPath`/
`externalCompletionLabel` — todo "Criar rascunho do fluxo" resetava a Diretoria pro modo
FORM em silêncio; e `dispatchWhatsApp` chamava `resolveChannelEnabled` com o lote de
preferências de **todos** os destinatários de um evento sem filtrar por usuário, então a
preferência de um usuário podia vazar pra outro que nunca configurou WhatsApp. Os dois
corrigidos junto — o primeiro porque `postsToJournal` teria o mesmo destino se não
corrigido, o segundo porque o dispatcher novo do Jornal (org-wide, lote grande) tornava o
mesmo tipo de bug muito mais provável de disparar de verdade.

**O bug de clonagem já tinha estragado produção antes desta correção existir.** Ao conferir
o deploy, a etapa Diretoria em produção estava com `completionMode: "FORM"` — a v8
(publicada antes desta rodada) tinha `EXTERNAL` certinho, mas a v9 (publicada por fora,
antes desta sessão, provavelmente na mesma leva que removeu o Financeiro) já tinha perdido
isso pro bug de clonagem, sem ninguém notar. Ou seja: o redirect pra Equipe da Obra parou de
funcionar em produção havia pelo menos uma versão, silenciosamente (etapa sem campos e sem
redirect = obra trava ali). `scripts/fix-diretoria-completion-mode.ts` republicou o valor
certo (v11) — a correção no `createDraftVersion` impede que aconteça de novo, mas não desfaz
sozinha dado já perdido em versões antigas; precisou de conferência manual pós-deploy pra
achar isso.

Verificado ponta a ponta contra o banco local antes do deploy (não só `npm test`/`tsc`/`build`):
criação de obra disparando `project.created` + `stage.milestone_reached`, post automático
criado com `sourceEventId`, reprocessamento do mesmo evento sem duplicar post, avanço pra
etapa não-marcada não gerando post, e clonagem de rascunho preservando `postsToJournal` de
uma versão publicada pra outra.

### Próximos passos (V1)

Todos os itens do roadmap inicial (upload de anexos, comentários com @menção,
escalonamento por SLA, paginação por cursor) estão entregues, junto com uma segunda rodada:
contas de usuário por setor, valor de contrato restrito, e-mail de seleção de profissional,
Jornal Sepeng e Estrutura da Equipe da Obra (a primeira tentativa de organograma foi revertida
— ver seção correspondente acima; a segunda, por obra e com drag-and-drop, é a que ficou).
`RESEND_API_KEY` já está provisionado (Produção e Preview) e testado com envio real — falta
só `EMAIL_FROM` com um domínio verificado na Resend pra sair de "só entrega em endereço de
teste" pra "entrega em qualquer profissional real". Uma terceira rodada simplificou
Orçamento, removeu Suprimentos, criou as primeiras contas nomeadas por setor (Erika e
Thaina), tirou a data do lembrete e trocou a etapa Diretoria por um redirect pro canvas de
equipe (ver seções acima). Uma quarta rodada entregou rate limiting de login e cadastro
próprio. **Todas as rodadas até aqui, incluindo a remoção do Financeiro e o reordenamento
RH/Segurança, já estão em produção** — ao conferir antes de deployar a quinta rodada,
descobriu-se que a documentação anterior deste arquivo estava desatualizada quanto a isso
(dizia "só local" pra rate limiting/cadastro e listava a remoção do Financeiro como
pendente; na prática só faltava mesmo a migration desta quinta rodada, `prisma migrate
status` contra o Neon confirmou isso). `RESEND_API_KEY` já está provisionado (Produção e
Preview) e testado com envio real — falta só `EMAIL_FROM` com um domínio verificado na
Resend pra sair de "só entrega em endereço de teste" pra "entrega em qualquer profissional
real".

Uma quinta rodada entregou o feed de atualizações, o aviso de Obra Ganha e o Jornal dirigido
(ver seção acima) — **já aplicada em produção**: migration (`prisma migrate deploy`),
`scripts/sync-permissions.ts` (`recipients:manage` nos papéis) e
`scripts/enable-journal-milestones.ts` (Orçamento/Obra Finalizada marcados) rodados contra o
Neon, fluxo publicado como v11. No mesmo processo, achou-se e corrigiu-se em produção a
regressão da Diretoria descrita acima (`scripts/fix-diretoria-completion-mode.ts`).

Próximos candidatos sem ordem definida: reset de senha ("esqueci minha senha" — a única
lacuna do levantamento de segurança que ainda falta), controles no editor visual pra
`completionMode`/`externalCompletionPath`/`postsToJournal` (hoje só por script), paginação/
filtros mais ricos nas outras listagens (`/lembretes`, auditoria), export CSV/PDF da equipe
da obra, e o que a Sepeng priorizar no uso real. Vale conferir periodicamente se a
documentação deste arquivo segue batendo com o estado real de produção (`prisma migrate
status` contra o Neon é a fonte da verdade, não o texto aqui) — já divergiu uma vez.
