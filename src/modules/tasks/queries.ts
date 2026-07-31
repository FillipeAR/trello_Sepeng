import { canReadProject } from "@/core/rbac/can";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/** Lembretes de uma obra — exige a mesma leitura de obra do restante do app. */
export async function listProjectTasks(actor: SessionContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    include: {
      team: { select: { userId: true } },
      stageInstances: { select: { stage: { select: { departmentId: true } } } },
    },
  });
  if (!project) return [];

  const visitedDepartmentIds = project.stageInstances
    .map((si) => si.stage.departmentId)
    .filter((d): d is string => Boolean(d));

  const allowed = canReadProject(actor, {
    visitedDepartmentIds,
    assignedUserIds: project.team.map((t) => t.userId),
  });
  if (!allowed) return [];

  return prisma.task.findMany({
    where: { organizationId: actor.organizationId, projectId },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

/** Lembretes em aberto atribuídos a mim ou criados por mim, em qualquer obra. */
export async function listMyReminders(actor: SessionContext) {
  return prisma.task.findMany({
    where: {
      organizationId: actor.organizationId,
      status: "OPEN",
      OR: [{ assigneeId: actor.userId }, { createdById: actor.userId }],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, code: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
}
