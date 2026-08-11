import { z } from "zod";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Lista curada por admin de quem recebe e-mail sempre que uma obra é criada
 * ("Obra Ganha") — distribuição fixa, sem relação com `User`/login, diferente
 * da preferência opt-in de `src/modules/notifications`.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.RECIPIENTS_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar a lista de avisos.", {
      errors: ["Permissão recipients:manage ausente."],
    });
  }
}

const recipientSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
});

export type ExternalRecipientInput = z.infer<typeof recipientSchema>;

export async function createExternalRecipient(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = recipientSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const recipient = await tx.externalNotificationRecipient.create({
      data: {
        organizationId: actor.organizationId,
        name: data.name,
        email: data.email,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "recipients.created",
      entityType: "ExternalNotificationRecipient",
      entityId: recipient.id,
      summary: `Contato "${recipient.name}" (${recipient.email}) adicionado à lista de avisos de obra ganha.`,
      after: recipient,
    });

    return recipient;
  });
}

export async function updateExternalRecipient(
  actor: SessionContext,
  input: { recipientId: string; data: unknown },
) {
  requireManage(actor);
  const data = recipientSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const recipient = await tx.externalNotificationRecipient.findFirst({
      where: { id: input.recipientId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!recipient) {
      throw new CommandError("Contato não encontrado.", { errors: ["Contato inexistente."] });
    }

    const updated = await tx.externalNotificationRecipient.update({
      where: { id: recipient.id },
      data: { name: data.name, email: data.email },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "recipients.updated",
      entityType: "ExternalNotificationRecipient",
      entityId: recipient.id,
      summary: `Contato "${updated.name}" atualizado.`,
      before: recipient,
      after: updated,
    });

    return updated;
  });
}

export async function deleteExternalRecipient(actor: SessionContext, input: { recipientId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const recipient = await tx.externalNotificationRecipient.findFirst({
      where: { id: input.recipientId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!recipient) {
      throw new CommandError("Contato não encontrado.", { errors: ["Contato inexistente."] });
    }

    await tx.externalNotificationRecipient.update({
      where: { id: recipient.id },
      data: { deletedAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "recipients.deleted",
      entityType: "ExternalNotificationRecipient",
      entityId: recipient.id,
      summary: `Contato "${recipient.name}" removido da lista de avisos de obra ganha.`,
      before: recipient,
    });
  });
}
