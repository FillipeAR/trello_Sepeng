import { z } from "zod";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Cadastro de engenheiros, encarregados e afins — pessoas que precisam
 * aparecer como opção em campos do fluxo (ex.: "Gerente responsável"), mas
 * não precisam (nem devem) ter login no sistema. Sem relação com `User`.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.STAFF_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar o cadastro de profissionais.", {
      errors: ["Permissão staff:manage ausente."],
    });
  }
}

const professionalSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  role: z.string().min(2, 'Informe a função (ex.: "Engenheiro civil", "Encarregado de obra").'),
  phone: z.string().optional().nullable(),
  /** Opcional — se preenchido, o profissional recebe um e-mail ao ser selecionado numa obra. */
  email: z.string().email("E-mail inválido.").optional().nullable().or(z.literal("")),
});

export type ProfessionalInput = z.infer<typeof professionalSchema>;

export async function createProfessional(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = professionalSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const professional = await tx.professional.create({
      data: {
        organizationId: actor.organizationId,
        name: data.name,
        role: data.role,
        phone: data.phone || null,
        email: data.email || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "staff.created",
      entityType: "Professional",
      entityId: professional.id,
      summary: `Profissional "${professional.name}" (${professional.role}) cadastrado.`,
      after: professional,
    });

    return professional;
  });
}

export async function updateProfessional(
  actor: SessionContext,
  input: { professionalId: string; data: unknown },
) {
  requireManage(actor);
  const data = professionalSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const professional = await tx.professional.findFirst({
      where: { id: input.professionalId, organizationId: actor.organizationId },
    });
    if (!professional) {
      throw new CommandError("Profissional não encontrado.", { errors: ["Profissional inexistente."] });
    }

    const updated = await tx.professional.update({
      where: { id: professional.id },
      data: { name: data.name, role: data.role, phone: data.phone || null, email: data.email || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "staff.updated",
      entityType: "Professional",
      entityId: professional.id,
      summary: `Profissional "${updated.name}" atualizado.`,
      before: professional,
      after: updated,
    });

    return updated;
  });
}

export async function deleteProfessional(actor: SessionContext, input: { professionalId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const professional = await tx.professional.findFirst({
      where: { id: input.professionalId, organizationId: actor.organizationId },
    });
    if (!professional) {
      throw new CommandError("Profissional não encontrado.", { errors: ["Profissional inexistente."] });
    }

    await tx.professional.update({ where: { id: professional.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "staff.deleted",
      entityType: "Professional",
      entityId: professional.id,
      summary: `Profissional "${professional.name}" removido do cadastro.`,
      before: professional,
    });
  });
}
