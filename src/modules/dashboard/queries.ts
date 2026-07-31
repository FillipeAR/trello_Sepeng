import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/**
 * Indicadores da Diretoria. No MVP são agregações diretas; a partir de algumas
 * centenas de obras isto migra para a tabela derivada `project_stage_metrics`
 * atualizada por evento (ver roadmap V2).
 */
export async function getDirectoryDashboard(actor: SessionContext) {
  const now = new Date();
  const orgId = actor.organizationId;

  const [total, active, completed, late, byStage, stageDurations] = await Promise.all([
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null, status: "ACTIVE" } }),
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null, status: "COMPLETED" } }),
    prisma.project.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: "ACTIVE",
        plannedEndDate: { lt: now },
      },
    }),
    prisma.stageInstance.findMany({
      where: { organizationId: orgId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      include: { stage: { include: { department: true } } },
    }),
    prisma.stageInstance.findMany({
      where: { organizationId: orgId, status: { in: ["COMPLETED", "IN_PROGRESS"] } },
      select: {
        enteredAt: true,
        completedAt: true,
        dueAt: true,
        slaBreached: true,
        status: true,
        stage: { select: { name: true, key: true, order: true, color: true } },
      },
    }),
  ]);

  // Quantas obras estão paradas em cada etapa — o gargalo aparece aqui. Uma
  // obra com ramos paralelos ativos conta em cada etapa em que está — é o
  // retrato correto de onde o trabalho está represado agora.
  const stageCounts = new Map<string, { name: string; color: string; order: number; count: number; department: string | null }>();
  for (const active of byStage) {
    const key = active.stage.key;
    const entry = stageCounts.get(key) ?? {
      name: active.stage.name,
      color: active.stage.color,
      order: active.stage.order,
      count: 0,
      department: active.stage.department?.name ?? null,
    };
    entry.count += 1;
    stageCounts.set(key, entry);
  }

  // Tempo médio de permanência por etapa (horas) — só etapas já concluídas.
  const durations = new Map<string, { name: string; totalHours: number; samples: number; breaches: number; order: number }>();
  for (const si of stageDurations) {
    const key = si.stage.key;
    const entry = durations.get(key) ?? {
      name: si.stage.name,
      totalHours: 0,
      samples: 0,
      breaches: 0,
      order: si.stage.order,
    };
    if (si.completedAt) {
      entry.totalHours += (si.completedAt.getTime() - si.enteredAt.getTime()) / 3_600_000;
      entry.samples += 1;
    }
    if (si.slaBreached) entry.breaches += 1;
    durations.set(key, entry);
  }

  return {
    totals: { total, active, completed, late },
    bottlenecks: [...stageCounts.values()].sort((a, b) => b.count - a.count),
    stageMetrics: [...durations.values()]
      .sort((a, b) => a.order - b.order)
      .map((d) => ({
        name: d.name,
        avgHours: d.samples > 0 ? d.totalHours / d.samples : null,
        samples: d.samples,
        breaches: d.breaches,
      })),
  };
}

/** Indicadores do departamento do usuário: fila e SLA. */
export async function getDepartmentDashboard(actor: SessionContext) {
  if (!actor.departmentId) return null;

  const instances = await prisma.stageInstance.findMany({
    where: {
      organizationId: actor.organizationId,
      stage: { departmentId: actor.departmentId },
    },
    select: { status: true, enteredAt: true, completedAt: true, dueAt: true, slaBreached: true },
  });

  const open = instances.filter((i) => i.status === "IN_PROGRESS" || i.status === "PENDING");
  const done = instances.filter((i) => i.completedAt);
  const avgHours =
    done.length > 0
      ? done.reduce((sum, i) => sum + (i.completedAt!.getTime() - i.enteredAt.getTime()), 0) /
        done.length /
        3_600_000
      : null;

  const now = new Date();

  return {
    departmentName: actor.departmentName,
    waiting: open.length,
    late: open.filter((i) => i.dueAt && i.dueAt < now).length,
    completed: done.length,
    avgHours,
    slaBreaches: instances.filter((i) => i.slaBreached).length,
  };
}

export async function getUnreadNotifications(actor: SessionContext, take = 10) {
  return prisma.notification.findMany({
    where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
}
