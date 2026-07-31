import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { CommandError } from "@/modules/projects/commands";

/**
 * Lembretes (`Task`): pendências pontuais dentro de uma obra, além do fluxo
 * formal — "ligar pro fornecedor", "conferir NF", etc. Não são etapa nem
 * ação de etapa; não têm efeito sobre o workflow. Autorização é a mesma
 * leitura de obra (`canReadProject`) + a permissão transversal `task:manage`.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.TASK_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar lembretes.", {
      errors: ["Permissão task:manage ausente."],
    });
  }
}

async function getReadableProject(tx: Tx, actor: SessionContext, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    include: {
      team: { select: { userId: true } },
      stageInstances: { select: { stage: { select: { departmentId: true } } } },
    },
  });
  if (!project) {
    throw new CommandError("Obra não encontrada.", { errors: ["Obra inexistente."] });
  }

  const visitedDepartmentIds = project.stageInstances
    .map((si) => si.stage.departmentId)
    .filter((d): d is string => Boolean(d));

  const allowed = canReadProject(actor, {
    visitedDepartmentIds,
    assignedUserIds: project.team.map((t) => t.userId),
  });
  if (!allowed) {
    throw new CommandError("Você não tem acesso a esta obra.", {
      errors: ["Sem permissão de leitura para esta obra."],
    });
  }

  return project;
}

async function getOwnedTask(tx: Tx, actor: SessionContext, taskId: string) {
  const task = await tx.task.findFirst({ where: { id: taskId, organizationId: actor.organizationId } });
  if (!task) {
    throw new CommandError("Lembrete não encontrado.", { errors: ["Lembrete inexistente."] });
  }
  await getReadableProject(tx, actor, task.projectId);
  return task;
}

const taskSchema = z.object({
  title: z.string().min(2, "Informe o título do lembrete."),
  description: z.string().optional().nullable(),
  assigneeId: z.string().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

export type TaskInput = z.infer<typeof taskSchema>;

export async function createTask(actor: SessionContext, input: { projectId: string; data: unknown }) {
  requireManage(actor);
  const data = taskSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    if (data.assigneeId) {
      const membership = await tx.membership.findFirst({
        where: { organizationId: actor.organizationId, userId: data.assigneeId, isActive: true },
        select: { id: true },
      });
      if (!membership) {
        throw new CommandError("Responsável inválido.", {
          errors: ["Selecione alguém ativo na organização."],
        });
      }
    }

    const task = await tx.task.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        title: data.title,
        description: data.description || null,
        assigneeId: data.assigneeId || null,
        dueAt: data.dueAt ?? null,
        createdById: actor.userId,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      summary: `Lembrete "${task.title}" criado na obra ${project.code}.`,
      after: task,
    });

    if (task.assigneeId && task.assigneeId !== actor.userId) {
      await enqueueEvent(tx, {
        organizationId: actor.organizationId,
        type: DOMAIN_EVENTS.TASK_ASSIGNED,
        payload: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          taskId: task.id,
          taskTitle: task.title,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          assigneeId: task.assigneeId,
          actorName: actor.userName,
        },
        idempotencyKey: `task.assigned:${task.id}`,
      });
    }

    return task;
  });
}

export async function completeTask(actor: SessionContext, input: { taskId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const task = await getOwnedTask(tx, actor, input.taskId);
    if (task.status !== "OPEN") {
      throw new CommandError("Este lembrete não está aberto.", { errors: ["Só é possível concluir um lembrete em aberto."] });
    }

    const updated = await tx.task.update({
      where: { id: task.id },
      data: { status: "DONE", completedAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "task.completed",
      entityType: "Task",
      entityId: task.id,
      summary: `Lembrete "${task.title}" concluído.`,
      before: task,
      after: updated,
    });

    return updated;
  });
}

export async function reopenTask(actor: SessionContext, input: { taskId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const task = await getOwnedTask(tx, actor, input.taskId);
    if (task.status === "OPEN") return task;

    const updated = await tx.task.update({
      where: { id: task.id },
      data: { status: "OPEN", completedAt: null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "task.reopened",
      entityType: "Task",
      entityId: task.id,
      summary: `Lembrete "${task.title}" reaberto.`,
      before: task,
      after: updated,
    });

    return updated;
  });
}

export async function deleteTask(actor: SessionContext, input: { taskId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const task = await getOwnedTask(tx, actor, input.taskId);
    await tx.task.delete({ where: { id: task.id } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "task.deleted",
      entityType: "Task",
      entityId: task.id,
      summary: `Lembrete "${task.title}" removido.`,
      before: task,
    });
  });
}
