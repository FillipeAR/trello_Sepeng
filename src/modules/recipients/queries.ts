import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/** Lista ativa de contatos externos avisados quando uma obra é criada. */
export async function listExternalRecipients(actor: SessionContext) {
  return prisma.externalNotificationRecipient.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}
