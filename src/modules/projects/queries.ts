import { canReadProject } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { getAvailableActions, isSlaBreached, workflowProgress } from "@/core/workflow/engine";
import type { AvailableAction, StageDef } from "@/core/workflow/types";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { loadSnapshot } from "@/modules/workflow/snapshot";

/**
 * Filtro de tenant + escopo de leitura traduzido para SQL. Nenhuma listagem do
 * sistema consulta `project` sem passar por aqui.
 */
function readScopeWhere(actor: SessionContext) {
  const base = { organizationId: actor.organizationId, deletedAt: null };

  if (actor.permissions.includes(PERMISSIONS.PROJECT_READ_ALL)) return base;

  const or = [];

  if (actor.permissions.includes(PERMISSIONS.PROJECT_READ_DEPARTMENT) && actor.departmentId) {
    or.push({ stageInstances: { some: { stage: { departmentId: actor.departmentId } } } });
  }

  if (actor.permissions.includes(PERMISSIONS.PROJECT_READ_ASSIGNED)) {
    or.push({ team: { some: { userId: actor.userId } } });
  }

  // Sem nenhum escopo de leitura, não vê nada.
  if (or.length === 0) return { ...base, id: "__sem_acesso__" };

  return { ...base, OR: or };
}

/** Mesma checagem de leitura usada em toda consulta de obra — para pontos que só
 * precisam de um booleano (ex.: rota de download de anexo), sem montar a página inteira. */
export async function canActorReadProject(actor: SessionContext, projectId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    include: {
      team: { select: { userId: true } },
      stageInstances: { select: { stage: { select: { departmentId: true } } } },
    },
  });
  if (!project) return false;

  const visitedDepartmentIds = project.stageInstances
    .map((si) => si.stage.departmentId)
    .filter((d): d is string => Boolean(d));

  return canReadProject(actor, {
    visitedDepartmentIds,
    assignedUserIds: project.team.map((t) => t.userId),
  });
}

export interface ProjectListFilters {
  stageKey?: string;
  status?: "ACTIVE" | "COMPLETED" | "CANCELLED";
  search?: string;
  onlyLate?: boolean;
}

/**
 * Lista obras com a(s) etapa(s) ativa(s) no momento — uma obra em ramos
 * paralelos tem mais de uma. Os campos singulares (`stageName`,
 * `displayStatus`, etc.) refletem a etapa ativa mais antiga (a "principal"
 * para exibição em tabela); `activeStages` traz todas.
 */
export async function listProjects(actor: SessionContext, filters: ProjectListFilters = {}) {
  const where = {
    ...readScopeWhere(actor),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { client: { contains: filters.search, mode: "insensitive" as const } },
            { code: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      team: { include: { user: { select: { id: true, name: true } } } },
      stageInstances: {
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: { enteredAt: "asc" },
        include: { stage: { include: { department: true } } },
      },
    },
  });

  const now = new Date();

  return projects
    .filter((p) =>
      filters.stageKey ? p.stageInstances.some((si) => si.stage.key === filters.stageKey) : true,
    )
    .map((p) => {
      const active = p.stageInstances;
      const primary = active[0] ?? null;
      const late = active.some((si) => isSlaBreached(si.dueAt, now)) || p.plannedEndDate < now;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        client: p.client,
        location: p.location,
        contractValue: Number(p.contractValue),
        plannedEndDate: p.plannedEndDate,
        progressPercent: p.progressPercent,
        status: p.status,
        stageName: primary?.stage.name ?? "—",
        stageKey: primary?.stage.key ?? null,
        displayStatus: primary?.stage.displayStatus ?? "Fluxo encerrado",
        stageColor: primary?.stage.color ?? "#64748b",
        departmentName: primary?.stage.department?.name ?? null,
        dueAt: primary?.dueAt ?? null,
        activeStageCount: active.length,
        activeStageKeys: active.map((si) => si.stage.key),
        isLate: p.status === "ACTIVE" && late,
        manager: p.team.find((t) => t.role === "MANAGER")?.user.name ?? null,
      };
    })
    .filter((p) => (filters.onlyLate ? p.isLate : true));
}

export interface TimelineStep {
  stage: StageDef;
  state: "COMPLETED" | "CURRENT" | "PENDING" | "RETURNED" | "SKIPPED";
  enteredAt: Date | null;
  completedAt: Date | null;
  dueAt: Date | null;
  isLate: boolean;
  completedByName: string | null;
  values: { label: string; value: unknown; type: string }[];
}

export interface ActiveStage {
  stage: StageDef;
  actions: AvailableAction[];
}

/** Obra completa: dados, esteira, ações disponíveis (por etapa ativa) e histórico. */
export async function getProjectDetail(actor: SessionContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    include: {
      createdBy: { select: { name: true } },
      workflow: true,
      team: { include: { user: { select: { id: true, name: true } } } },
      updates: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { author: { select: { name: true } } },
      },
      stageInstances: {
        orderBy: { enteredAt: "asc" },
        include: {
          completedBy: { select: { name: true } },
          fieldValues: { include: { field: true } },
        },
      },
    },
  });

  if (!project?.workflow) return null;

  const visitedDepartmentIds: string[] = [];
  const snapshot = await loadSnapshot(project.workflow.workflowVersionId);

  for (const si of project.stageInstances) {
    const stage = snapshot.stages.find((s) => s.id === si.stageId);
    if (stage?.departmentId) visitedDepartmentIds.push(stage.departmentId);
  }

  const openInstances = project.stageInstances.filter(
    (si) => si.status === "PENDING" || si.status === "IN_PROGRESS",
  );
  const activeStageIds = openInstances.map((si) => si.stageId);

  const allowed = canReadProject(actor, {
    visitedDepartmentIds,
    assignedUserIds: project.team.map((t) => t.userId),
  });

  if (!allowed) return null;

  const now = new Date();
  const ordered = [...snapshot.stages].sort((a, b) => a.order - b.order);

  const timeline: TimelineStep[] = ordered.map((stage) => {
    const instances = project.stageInstances.filter((si) => si.stageId === stage.id);
    const last = instances[instances.length - 1];
    const isCurrent = activeStageIds.includes(stage.id);

    const state: TimelineStep["state"] = isCurrent
      ? "CURRENT"
      : last?.status === "COMPLETED"
        ? "COMPLETED"
        : last?.status === "RETURNED"
          ? "RETURNED"
          : last?.status === "SKIPPED"
            ? "SKIPPED"
            : "PENDING";

    return {
      stage,
      state,
      enteredAt: last?.enteredAt ?? null,
      completedAt: last?.completedAt ?? null,
      dueAt: last?.dueAt ?? null,
      isLate: isCurrent && isSlaBreached(last?.dueAt ?? null, now),
      completedByName: last?.completedBy?.name ?? null,
      values:
        last?.fieldValues.map((fv) => ({
          label: fv.field.label,
          value: fv.value,
          type: fv.field.type,
        })) ?? [],
    };
  });

  // Uma etapa por ramo ativo — sequencial tem no máximo uma; paralelo, várias.
  const activeStages: ActiveStage[] = activeStageIds
    .map((id) => snapshot.stages.find((s) => s.id === id))
    .filter((stage): stage is StageDef => Boolean(stage))
    .map((stage) => ({ stage, actions: getAvailableActions(snapshot, stage.id, actor) }));

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      client: project.client,
      location: project.location,
      contractValue: Number(project.contractValue),
      plannedStartDate: project.plannedStartDate,
      plannedEndDate: project.plannedEndDate,
      scopeSummary: project.scopeSummary,
      progressPercent: project.progressPercent,
      status: project.status,
      createdByName: project.createdBy.name,
      createdAt: project.createdAt,
    },
    workflowVersion: snapshot.version,
    activeStages,
    timeline,
    progress: workflowProgress(snapshot, activeStageIds),
    team: project.team.map((t) => ({ id: t.userId, name: t.user.name, role: t.role })),
    updates: project.updates.map((u) => ({
      id: u.id,
      type: u.type,
      description: u.description,
      progressPercent: u.progressPercent,
      occurredAt: u.occurredAt,
      authorName: u.author.name,
    })),
  };
}

/** Fila pessoal: obras com alguma etapa ativa no departamento do usuário. */
export async function listMyQueue(actor: SessionContext) {
  const projects = await listProjects(actor, { status: "ACTIVE" });
  if (!actor.departmentId) return [];

  const stageDepartments = await prisma.workflowStage.findMany({
    where: { organizationId: actor.organizationId, departmentId: actor.departmentId },
    select: { key: true },
  });
  const myStageKeys = new Set(stageDepartments.map((s) => s.key));

  return projects.filter((p) => p.activeStageKeys.some((key) => myStageKeys.has(key)));
}

export async function getProjectAuditTrail(actor: SessionContext, projectId: string) {
  return prisma.auditLog.findMany({
    where: {
      organizationId: actor.organizationId,
      entityType: "Project",
      entityId: projectId,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true } } },
  });
}
