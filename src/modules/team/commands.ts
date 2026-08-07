import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";
import { enqueueStaffAssignedEvent } from "@/modules/staff/notify";
import { wouldCreateCycle, type FlatTeamPosition } from "./tree";
import { TEAM_POSITION_PERMISSIONS } from "./permissions-catalog";

/**
 * Estrutura da equipe de uma obra (tela "Equipe da obra") — cada obra tem a
 * sua própria árvore de cargos, sem template compartilhado. Autorização:
 * `staff:manage` pra escrever (mesma permissão que já rege o cadastro de
 * Profissionais), mais a leitura normal de obra (`canReadProject`).
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.STAFF_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar a equipe da obra.", {
      errors: ["Permissão staff:manage ausente."],
    });
  }
}

const permissionKeys = TEAM_POSITION_PERMISSIONS.map((p) => p.key);
const permissionsSchema = z.array(z.enum(permissionKeys as [string, ...string[]])).default([]);

const positionSchema = z.object({
  title: z.string().min(2, "Informe o nome do cargo."),
  sector: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  permissions: permissionsSchema,
});

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

async function loadFlatPositions(tx: Tx, organizationId: string, projectId: string): Promise<FlatTeamPosition[]> {
  const rows = await tx.teamPosition.findMany({
    where: { organizationId, projectId, deletedAt: null },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    sector: r.sector,
    parentId: r.parentId,
    professionalId: r.professionalId,
    permissions: (r.permissions as string[] | null) ?? [],
    positionX: r.positionX,
    positionY: r.positionY,
    order: r.order,
  }));
}

async function assertValidParent(tx: Tx, organizationId: string, projectId: string, parentId: string | null) {
  if (!parentId) return;
  const parent = await tx.teamPosition.findFirst({
    where: { id: parentId, organizationId, projectId, deletedAt: null },
  });
  if (!parent) {
    throw new CommandError("Cargo superior inválido.", { errors: ["Cargo não encontrado nesta obra."] });
  }
}

export async function createPosition(actor: SessionContext, input: { projectId: string; data: unknown }) {
  requireManage(actor);
  const data = positionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);
    await assertValidParent(tx, actor.organizationId, project.id, data.parentId ?? null);

    const siblingCount = await tx.teamPosition.count({
      where: { organizationId: actor.organizationId, projectId: project.id, parentId: data.parentId || null, deletedAt: null },
    });

    const position = await tx.teamPosition.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        title: data.title,
        sector: data.sector || null,
        parentId: data.parentId || null,
        permissions: data.permissions,
        order: siblingCount,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "team.position_created",
      entityType: "TeamPosition",
      entityId: position.id,
      summary: `Cargo "${position.title}" criado na equipe da obra.`,
      after: position,
    });

    return position;
  });
}

export async function updatePosition(actor: SessionContext, input: { positionId: string; data: unknown }) {
  requireManage(actor);
  const data = positionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const position = await tx.teamPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    await assertValidParent(tx, actor.organizationId, position.projectId, data.parentId ?? null);

    if (data.parentId) {
      const flat = await loadFlatPositions(tx, actor.organizationId, position.projectId);
      if (wouldCreateCycle(flat, position.id, data.parentId)) {
        throw new CommandError("Não é possível criar um ciclo na hierarquia.", {
          errors: ["Este cargo não pode reportar a um dos seus próprios subordinados."],
        });
      }
    }

    const updated = await tx.teamPosition.update({
      where: { id: position.id },
      data: {
        title: data.title,
        sector: data.sector || null,
        parentId: data.parentId || null,
        permissions: data.permissions,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "team.position_updated",
      entityType: "TeamPosition",
      entityId: position.id,
      summary: `Cargo "${updated.title}" atualizado.`,
      before: position,
      after: updated,
    });

    return updated;
  });
}

export async function deletePosition(actor: SessionContext, input: { positionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const position = await tx.teamPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    // Filhos diretos sobem pro topo (parentId null), não em cascata — evita apagar um
    // galho inteiro da equipe sem querer.
    await tx.teamPosition.updateMany({
      where: { organizationId: actor.organizationId, projectId: position.projectId, parentId: position.id },
      data: { parentId: null },
    });

    await tx.teamPosition.update({ where: { id: position.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "team.position_deleted",
      entityType: "TeamPosition",
      entityId: position.id,
      summary: `Cargo "${position.title}" removido da equipe da obra.`,
      before: position,
    });
  });
}

/** Move o cargo no canvas — persistência leve do arrastar (sem tocar nos outros campos). */
export async function moveNodeOnCanvas(
  actor: SessionContext,
  input: { positionId: string; positionX: number; positionY: number },
) {
  requireManage(actor);

  const position = await prisma.teamPosition.findFirst({
    where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!position) {
    throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
  }

  return prisma.teamPosition.update({
    where: { id: position.id },
    data: { positionX: input.positionX, positionY: input.positionY },
  });
}

/** Arrastar uma conexão de um cargo pra outro reatribui o "Superior". */
export async function reparentPosition(actor: SessionContext, input: { positionId: string; parentId: string | null }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const position = await tx.teamPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    await assertValidParent(tx, actor.organizationId, position.projectId, input.parentId);

    if (input.parentId) {
      const flat = await loadFlatPositions(tx, actor.organizationId, position.projectId);
      if (wouldCreateCycle(flat, position.id, input.parentId)) {
        throw new CommandError("Não é possível criar um ciclo na hierarquia.", {
          errors: ["Este cargo não pode reportar a um dos seus próprios subordinados."],
        });
      }
    }

    return tx.teamPosition.update({ where: { id: position.id }, data: { parentId: input.parentId } });
  });
}

export async function assignProfessional(
  actor: SessionContext,
  input: { positionId: string; professionalId: string | null },
) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const position = await tx.teamPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    let professional: { id: string; name: string } | null = null;
    if (input.professionalId) {
      professional = await tx.professional.findFirst({
        where: { id: input.professionalId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!professional) {
        throw new CommandError("Profissional não encontrado.", { errors: ["Profissional inexistente."] });
      }
    }

    const project = await tx.project.findFirstOrThrow({
      where: { id: position.projectId },
      select: { id: true, name: true, code: true },
    });

    const updated = await tx.teamPosition.update({
      where: { id: position.id },
      data: { professionalId: input.professionalId || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "team.position_assigned",
      entityType: "TeamPosition",
      entityId: position.id,
      summary: professional
        ? `"${professional.name}" atribuído(a) ao cargo "${position.title}" na equipe da obra.`
        : `Cargo "${position.title}" desocupado na equipe da obra.`,
      before: { professionalId: position.professionalId },
      after: { professionalId: updated.professionalId },
    });

    if (professional && professional.id !== position.professionalId) {
      await enqueueStaffAssignedEvent(tx, {
        organizationId: actor.organizationId,
        professionalId: professional.id,
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        contextLabel: position.title,
      });
    }

    return updated;
  });
}
