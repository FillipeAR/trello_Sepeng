import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";

/** Comentários da obra (thread geral, não os de justificativa por etapa). */
export async function listProjectComments(actor: SessionContext, projectId: string) {
  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return [];

  return prisma.comment.findMany({
    where: {
      organizationId: actor.organizationId,
      entityType: "PROJECT",
      entityId: projectId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true } },
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });
}
