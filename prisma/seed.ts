import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  PERMISSION_CATALOG,
} from "../src/core/rbac/permissions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ORG_SLUG = "sepeng";
const DEMO_PASSWORD = "obraflow123";

const DEPARTMENTS = [
  { slug: "diretoria", name: "Diretoria" },
  { slug: "orcamento", name: "Orçamento" },
  { slug: "rh", name: "Recursos Humanos" },
  { slug: "seguranca", name: "Segurança do Trabalho" },
  { slug: "financeiro", name: "Financeiro" },
  { slug: "suprimentos", name: "Suprimentos" },
  { slug: "execucao", name: "Execução de Obra" },
];

const DEMO_USERS = [
  { name: "Administrador", email: "admin@obraflow.com", roleSlug: "administrador", departmentSlug: null },
  { name: "Carla Diretoria", email: "diretoria@obraflow.com", roleSlug: "diretoria", departmentSlug: "diretoria" },
  { name: "Bruno Orçamento", email: "orcamento@obraflow.com", roleSlug: "orcamento", departmentSlug: "orcamento" },
  { name: "Denise RH", email: "rh@obraflow.com", roleSlug: "rh", departmentSlug: "rh" },
  { name: "Eduardo Segurança", email: "seguranca@obraflow.com", roleSlug: "seguranca", departmentSlug: "seguranca" },
  { name: "Fabiana Financeiro", email: "financeiro@obraflow.com", roleSlug: "financeiro", departmentSlug: "financeiro" },
  { name: "Gustavo Suprimentos", email: "suprimentos@obraflow.com", roleSlug: "suprimentos", departmentSlug: "suprimentos" },
  { name: "Helena Gestora", email: "gestor@obraflow.com", roleSlug: "gestor-obra", departmentSlug: "execucao" },
  { name: "Ivo Visualizador", email: "visualizador@obraflow.com", roleSlug: "visualizador", departmentSlug: null },
];

/**
 * O fluxo do briefing, expresso como DADO. Reordenar, inserir "Jurídico" ou
 * remover uma etapa é editar esta estrutura (ou o editor de fluxos na UI) —
 * nenhuma linha de código da aplicação muda.
 */
const STAGE_BLUEPRINT = [
  {
    key: "orcamento",
    name: "Orçamento",
    displayStatus: "Obra Ganha",
    description: "Cadastro da obra ganha com os dados de contrato e escopo.",
    departmentSlug: "orcamento",
    slaHours: 24,
    color: "#0ea5e9",
    isInitial: true,
    fields: [
      { key: "documentos", label: "Documentos do contrato", type: "FILE", required: false },
      { key: "observacoes", label: "Observações do orçamento", type: "TEXTAREA", required: false },
    ],
    actions: [
      { key: "avancar", label: "Enviar para a Diretoria", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
    ],
  },
  {
    key: "diretoria",
    name: "Diretoria",
    displayStatus: "Planejamento Aprovado",
    description: "Definição de gerente, encarregado, equipe e recursos.",
    departmentSlug: "diretoria",
    slaHours: 48,
    color: "#6366f1",
    fields: [
      { key: "gerente", label: "Gerente responsável", type: "USER", required: true },
      { key: "encarregado", label: "Encarregado responsável", type: "USER", required: true },
      { key: "equipe", label: "Equipe necessária", type: "USER_MULTI", required: false },
      { key: "quantidade_funcionarios", label: "Quantidade de funcionários", type: "NUMBER", required: true },
      { key: "recursos_necessarios", label: "Recursos necessários", type: "TEXTAREA", required: true },
    ],
    actions: [
      { key: "avancar", label: "Aprovar planejamento", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
      { key: "devolver", label: "Devolver ao Orçamento", kind: "RETURN", target: "orcamento", permission: PERMISSIONS.STAGE_ROLLBACK, requiresComment: true, variant: "ghost" },
    ],
  },
  {
    key: "rh",
    name: "Recursos Humanos",
    displayStatus: "RH Concluído",
    description: "Disponibilidade de pessoal, admissões e documentação.",
    departmentSlug: "rh",
    slaHours: 72,
    color: "#14b8a6",
    fields: [
      { key: "disponibilidade_verificada", label: "Disponibilidade de funcionários verificada", type: "CHECKBOX", required: true },
      { key: "admissoes_solicitadas", label: "Admissões solicitadas", type: "NUMBER", required: false },
      { key: "documentacao_ok", label: "Documentação solicitada e recebida", type: "CHECKBOX", required: true },
      { key: "pendencias", label: "Pendências em aberto", type: "TEXTAREA", required: false },
    ],
    actions: [
      { key: "avancar", label: "Concluir RH", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
      { key: "devolver", label: "Devolver à Diretoria", kind: "RETURN", target: "diretoria", permission: PERMISSIONS.STAGE_ROLLBACK, requiresComment: true, variant: "ghost" },
    ],
  },
  {
    key: "seguranca",
    name: "Segurança do Trabalho",
    displayStatus: "Segurança Liberada",
    description: "EPIs, treinamentos obrigatórios e liberação da equipe.",
    departmentSlug: "seguranca",
    slaHours: 48,
    color: "#f59e0b",
    fields: [
      { key: "epis_necessarios", label: "EPIs necessários", type: "TEXTAREA", required: true },
      {
        key: "treinamentos",
        label: "Treinamentos obrigatórios",
        type: "MULTISELECT",
        required: true,
        options: [
          { value: "nr06", label: "NR-06 — EPI" },
          { value: "nr10", label: "NR-10 — Elétrica" },
          { value: "nr12", label: "NR-12 — Máquinas" },
          { value: "nr18", label: "NR-18 — Construção Civil" },
          { value: "nr35", label: "NR-35 — Trabalho em Altura" },
        ],
      },
      { key: "documentacao_seguranca", label: "Documentação de segurança emitida", type: "CHECKBOX", required: true },
      { key: "equipe_liberada", label: "Equipe liberada para a obra", type: "CHECKBOX", required: true },
    ],
    actions: [
      { key: "avancar", label: "Liberar Segurança", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
      { key: "devolver", label: "Devolver ao RH", kind: "RETURN", target: "rh", permission: PERMISSIONS.STAGE_ROLLBACK, requiresComment: true, variant: "ghost" },
    ],
  },
  {
    key: "financeiro",
    name: "Financeiro",
    displayStatus: "Financeiro Liberado",
    description: "Aprovação do orçamento operacional e dos custos previstos.",
    departmentSlug: "financeiro",
    slaHours: 72,
    color: "#22c55e",
    fields: [
      { key: "orcamento_operacional", label: "Orçamento operacional aprovado", type: "CURRENCY", required: true },
      { key: "custos_previstos", label: "Custos previstos", type: "TEXTAREA", required: false },
      { key: "aprovacao_financeira", label: "Aprovação financeira concedida", type: "CHECKBOX", required: true },
    ],
    actions: [
      { key: "avancar", label: "Liberar Financeiro", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
      { key: "devolver", label: "Devolver à Segurança", kind: "RETURN", target: "seguranca", permission: PERMISSIONS.STAGE_ROLLBACK, requiresComment: true, variant: "ghost" },
      { key: "reprovar", label: "Reprovar obra", kind: "REJECT", target: "diretoria", permission: PERMISSIONS.STAGE_REJECT, requiresComment: true, variant: "danger" },
    ],
  },
  {
    key: "suprimentos",
    name: "Suprimentos",
    displayStatus: "Suprimentos Concluído",
    description: "Compra de materiais, reserva de estoque e contratações.",
    departmentSlug: "suprimentos",
    slaHours: 120,
    color: "#a855f7",
    fields: [
      { key: "materiais_comprados", label: "Materiais comprados", type: "CHECKBOX", required: true },
      { key: "reserva_estoque", label: "Reserva de estoque", type: "TEXTAREA", required: false },
      { key: "contratacoes", label: "Contratações necessárias", type: "TEXTAREA", required: false },
      { key: "previsao_entrega", label: "Previsão de entrega dos materiais", type: "DATE", required: true },
    ],
    actions: [
      { key: "avancar", label: "Concluir Suprimentos", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
      { key: "devolver", label: "Devolver ao Financeiro", kind: "RETURN", target: "financeiro", permission: PERMISSIONS.STAGE_ROLLBACK, requiresComment: true, variant: "ghost" },
    ],
  },
  {
    key: "execucao",
    name: "Obra em Execução",
    displayStatus: "Obra em Execução",
    description: "Progresso, fotos, ocorrências e percentual concluído.",
    departmentSlug: "execucao",
    slaHours: null,
    color: "#ef4444",
    fields: [
      { key: "data_inicio_real", label: "Data de início efetiva", type: "DATE", required: true },
      { key: "percentual_concluido", label: "Percentual concluído (%)", type: "NUMBER", required: true },
      { key: "registro_fotografico", label: "Registro fotográfico", type: "FILE", required: false },
      { key: "ocorrencias", label: "Ocorrências registradas", type: "TEXTAREA", required: false },
    ],
    actions: [
      { key: "avancar", label: "Enviar para encerramento", kind: "ADVANCE", permission: PERMISSIONS.STAGE_COMPLETE },
    ],
  },
  {
    key: "finalizada",
    name: "Obra Finalizada",
    displayStatus: "Obra Finalizada",
    description: "Entrega, relatório final e encerramento com histórico completo.",
    departmentSlug: "execucao",
    slaHours: null,
    color: "#334155",
    isFinal: true,
    fields: [
      { key: "data_entrega", label: "Data de entrega", type: "DATE", required: true },
      { key: "relatorio_final", label: "Relatório final", type: "TEXTAREA", required: true },
      { key: "documentos_entrega", label: "Documentos de entrega", type: "FILE", required: false },
    ],
    actions: [
      { key: "encerrar", label: "Encerrar obra", kind: "FINISH", permission: PERMISSIONS.STAGE_COMPLETE },
    ],
  },
] as const;

async function main() {
  console.log("→ Semeando catálogo de permissões…");
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, category: p.category, description: p.description },
      update: { category: p.category, description: p.description },
    });
  }

  console.log("→ Organização…");
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    create: { slug: ORG_SLUG, name: "Sepeng Engenharia" },
    update: {},
  });

  console.log("→ Departamentos…");
  const departments = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const dep = await prisma.department.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: d.slug } },
      create: { organizationId: org.id, slug: d.slug, name: d.name },
      update: { name: d.name },
    });
    departments.set(d.slug, dep.id);
  }

  console.log("→ Papéis e permissões…");
  const roles = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: r.slug } },
      create: {
        organizationId: org.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        isSystem: true,
      },
      update: { name: r.name, description: r.description },
    });
    roles.set(r.slug, role.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({
      where: { key: { in: [...r.permissions] } },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  console.log("→ Usuários de demonstração…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, passwordHash },
      update: { name: u.name, passwordHash },
    });

    const roleId = roles.get(u.roleSlug);
    if (!roleId) throw new Error(`Papel não encontrado: ${u.roleSlug}`);

    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      create: {
        organizationId: org.id,
        userId: user.id,
        roleId,
        departmentId: u.departmentSlug ? departments.get(u.departmentSlug) : null,
      },
      update: {
        roleId,
        departmentId: u.departmentSlug ? departments.get(u.departmentSlug) : null,
      },
    });
  }

  console.log("→ Fluxo padrão (8 etapas)…");
  const definition = await prisma.workflowDefinition.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "obra-padrao" } },
    create: {
      organizationId: org.id,
      slug: "obra-padrao",
      name: "Fluxo Padrão de Obra",
      description: "Da obra ganha ao encerramento, passando por todos os departamentos.",
      isDefault: true,
    },
    update: { isDefault: true },
  });

  const existingV1 = await prisma.workflowVersion.findUnique({
    where: { definitionId_version: { definitionId: definition.id, version: 1 } },
  });
  if (existingV1) {
    // Recria a v1 do zero para manter o seed idempotente.
    await prisma.workflowVersion.delete({ where: { id: existingV1.id } });
  }

  const version = await prisma.workflowVersion.create({
    data: {
      organizationId: org.id,
      definitionId: definition.id,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
      notes: "Versão inicial semeada a partir do fluxo definido pela empresa.",
    },
  });

  const stageIds = new Map<string, string>();
  for (const [index, blueprint] of STAGE_BLUEPRINT.entries()) {
    const stage = await prisma.workflowStage.create({
      data: {
        organizationId: org.id,
        versionId: version.id,
        key: blueprint.key,
        name: blueprint.name,
        displayStatus: blueprint.displayStatus,
        description: blueprint.description,
        order: index,
        departmentId: departments.get(blueprint.departmentSlug) ?? null,
        slaHours: blueprint.slaHours,
        color: blueprint.color,
        isInitial: "isInitial" in blueprint ? blueprint.isInitial : false,
        isFinal: "isFinal" in blueprint ? blueprint.isFinal : false,
        fields: {
          create: blueprint.fields.map((f, i) => ({
            organizationId: org.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            order: i,
            options: "options" in f ? (f.options as object) : undefined,
          })),
        },
      },
    });
    stageIds.set(blueprint.key, stage.id);
  }

  // Ações criadas depois das etapas: RETURN/REJECT apontam para etapas anteriores.
  for (const blueprint of STAGE_BLUEPRINT) {
    const stageId = stageIds.get(blueprint.key)!;
    for (const [i, action] of blueprint.actions.entries()) {
      await prisma.stageAction.create({
        data: {
          organizationId: org.id,
          stageId,
          key: action.key,
          label: action.label,
          kind: action.kind,
          targetStageId: "target" in action ? (stageIds.get(action.target) ?? null) : null,
          requiredPermission: action.permission,
          requiresComment: "requiresComment" in action ? action.requiresComment : false,
          order: i,
          variant: "variant" in action ? action.variant : "primary",
        },
      });
    }
  }

  console.log("\n✔ Seed concluído.");
  console.log(`  Organização: ${org.name}`);
  console.log(`  Etapas: ${STAGE_BLUEPRINT.length} · Papéis: ${DEFAULT_ROLES.length} · Usuários: ${DEMO_USERS.length}`);
  console.log(`  Login de demonstração — senha para todos: ${DEMO_PASSWORD}`);
  for (const u of DEMO_USERS) console.log(`    ${u.email.padEnd(30)} ${u.roleSlug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
