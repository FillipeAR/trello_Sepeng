import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/** Cadastro ativo de profissionais — fonte dos campos do tipo STAFF. */
export async function listProfessionals(actor: SessionContext) {
  return prisma.professional.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}
