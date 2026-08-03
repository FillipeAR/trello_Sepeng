import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { CommandError } from "@/modules/projects/commands";

/**
 * Comentários na obra (`entityType: PROJECT`) — discussão geral, separada dos
 * comentários de justificativa que `executeStageAction` grava por etapa
 * (`entityType: STAGE_INSTANCE`). @menção é uma lista de usuários explícita,
 * não um parser de texto — mais confiável, e ainda assim o texto ganha
 * "@Nome" pela UI para manter a convenção visual.
 */

const commentSchema = z.object({
  body: z.string().min(1, "Escreva um comentário.").max(4000, "Comentário muito longo."),
  mentionUserIds: z.array(z.string()).max(20, "No máximo 20 pessoas por comentário."),
});

/** Mesma checagem de `canActorReadProject`, mas rodando na `tx` do comando —
 * misturar o client global com uma transação aberta quebra o protocolo do Postgres. */
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

export async function createComment(
  actor: SessionContext,
  input: { projectId: string; data: unknown },
) {
  if (!hasPermission(actor, PERMISSIONS.COMMENT_CREATE)) {
    throw new CommandError("Você não tem permissão para comentar.", {
      errors: ["Permissão comment:create ausente."],
    });
  }
  const data = commentSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    const mentionIds = [...new Set(data.mentionUserIds)];
    if (mentionIds.length > 0) {
      const validMembers = await tx.membership.count({
        where: { organizationId: actor.organizationId, userId: { in: mentionIds }, isActive: true },
      });
      if (validMembers !== mentionIds.length) {
        throw new CommandError("Pessoa mencionada inválida.", {
          errors: ["Alguém marcado não pertence mais à organização."],
        });
      }
    }

    const comment = await tx.comment.create({
      data: {
        organizationId: actor.organizationId,
        entityType: "PROJECT",
        entityId: project.id,
        authorId: actor.userId,
        body: data.body.trim(),
        mentions: {
          create: mentionIds.map((userId) => ({ organizationId: actor.organizationId, userId })),
        },
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "comment.created",
      entityType: "Project",
      entityId: project.id,
      summary: `Comentário adicionado à obra ${project.code}${mentionIds.length > 0 ? ` (${mentionIds.length} mencionado(s))` : ""}.`,
      after: comment,
    });

    const mentionsToNotify = mentionIds.filter((id) => id !== actor.userId);
    if (mentionsToNotify.length > 0) {
      await enqueueEvent(tx, {
        organizationId: actor.organizationId,
        type: DOMAIN_EVENTS.MENTION_CREATED,
        payload: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          commentId: comment.id,
          actorName: actor.userName,
          excerpt: data.body.trim().slice(0, 140),
          mentionedUserIds: mentionsToNotify,
        },
        idempotencyKey: `mention.created:${comment.id}`,
      });
    }

    return comment;
  });
}
