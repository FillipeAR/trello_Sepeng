# ObraFlow

Gestão operacional de obras da construção civil. Cada obra percorre uma esteira de
departamentos — Orçamento → Diretoria → RH → Segurança → Financeiro → Suprimentos →
Execução → Encerramento — e todo mundo acompanha em tempo real em que etapa ela está,
quem responde por ela e o que falta.

**O fluxo é configuração, não código.** Inserir um departamento, reordenar etapas ou
mudar os campos exigidos é editar dado — sem deploy, sem refatoração.

A decisão de arquitetura completa está em [ARQUITETURA.md](ARQUITETURA.md).

---

## Rodando localmente

Precisa de Node 22+. Não precisa de Docker.

```bash
npm install
```

Suba o Postgres local (deixe rodando em um terminal separado):

```bash
npx prisma dev --name obraflow
```

Ele imprime uma `DATABASE_URL`. Se a porta for diferente da que está no `.env`, atualize o
arquivo. Depois, em outro terminal:

```bash
npm run db:push && npm run db:seed && npm run dev
```

Abra http://localhost:3000.

### Contas de demonstração

Senha para todas: `obraflow123`

| E-mail | Papel |
|---|---|
| `orcamento@obraflow.com` | Orçamento — cadastra a obra |
| `diretoria@obraflow.com` | Diretoria — define gerente, equipe e recursos |
| `rh@obraflow.com` | RH |
| `seguranca@obraflow.com` | Segurança do Trabalho |
| `financeiro@obraflow.com` | Financeiro |
| `suprimentos@obraflow.com` | Suprimentos |
| `gestor@obraflow.com` | Gestor de Obra |
| `admin@obraflow.com` | Administrador — vê e destrava tudo |
| `visualizador@obraflow.com` | Somente leitura |

### O percurso que vale a pena fazer

1. Entre como **Orçamento**, cadastre uma obra. Ela nasce com status *Obra Ganha*.
2. Envie para a Diretoria. Repare que a etapa da Diretoria aparece bloqueada para você —
   o RBAC explica o motivo em vez de simplesmente esconder o botão.
3. Entre como **Diretoria**. A obra está em *Minhas tarefas*. Tente aprovar sem preencher
   nada: o sistema aponta cada campo obrigatório.
4. Preencha e aprove. A obra segue para o RH e a notificação chega para o departamento.
5. Abra **Histórico completo**: cada transição com autor, data, valor anterior e novo.

---

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm test           # testes do engine e do RBAC (46 casos, sem banco)
npm run db:push    # aplica o schema no banco de desenvolvimento
npm run db:seed    # semeia organização, papéis, usuários e o fluxo de 8 etapas
npm run db:studio  # inspeciona o banco
```

## Prova de que o fluxo é configurável

```bash
npx tsx scripts/demo-inserir-etapa.ts
```

Publica a v2 do fluxo com uma etapa **Jurídico** entre Orçamento e Diretoria. Obras novas
passam a percorrer 9 etapas; as que já estavam em andamento continuam na v1, intactas.
Nenhum arquivo de aplicação é alterado.

O mesmo resultado — e mais — dá pra fazer pela tela: em `/admin/fluxos`, "Criar rascunho
do fluxo" abre um editor para adicionar/reordenar etapas, campos e ações; "Publicar
versão" promove o rascunho e arquiva a versão anterior.

---

## Onde está o quê

| Preciso mexer em… | Vá para |
|---|---|
| Regra de transição entre etapas | `src/core/workflow/engine.ts` |
| Condições de fluxo | `src/core/workflow/conditions.ts` |
| Editor de fluxos (rascunho, publicação) | `src/modules/workflow/commands.ts`, `/admin/fluxos` |
| Permissões e papéis | `src/core/rbac/` |
| Escrita de dados (obras, etapas) | `src/modules/projects/commands.ts` |
| Leitura com escopo de permissão | `src/modules/projects/queries.ts` |
| Notificações e canais futuros | `src/modules/notifications/dispatcher.ts` |
| Modelo de dados | `prisma/schema.prisma` |
| O fluxo inicial de 8 etapas | `prisma/seed.ts` |

## Produção

O banco de desenvolvimento é o `prisma dev` (local, efêmero). Em produção, provisione um
Postgres pelo Vercel Marketplace (Neon), aponte `DATABASE_URL` para ele e aplique as
migrations com `npx prisma migrate deploy` — o arquivo inicial já está em
`prisma/migrations/`. Gere um `AUTH_SECRET` real com `openssl rand -base64 32`.
