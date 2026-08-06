import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";
import type { FlatPosition } from "./tree";

/** Template de cargos da organização — compartilhado entre todas as obras. */
export async function listOrgChartPositions(actor: SessionContext): Promise<FlatPosition[]> {
  return prisma.orgChartPosition.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    orderBy: { order: "asc" },
    select: { id: true, title: true, parentId: true, order: true },
  });
}

export interface OrgChartOccupant {
  id: string;
  name: string;
  role: string;
}

export interface ProjectOrgChart {
  positions: FlatPosition[];
  professionals: OrgChartOccupant[];
  occupantByPositionId: Record<string, OrgChartOccupant | null>;
}

/** O organograma aplicado a uma obra: o template + quem ocupa cada cargo nela. */
export async function getProjectOrgChart(actor: SessionContext, projectId: string): Promise<ProjectOrgChart | null> {
  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return null;

  const [positions, assignments, professionals] = await Promise.all([
    listOrgChartPositions(actor),
    prisma.projectOrgChartAssignment.findMany({
      where: { organizationId: actor.organizationId, projectId },
      select: { positionId: true, professionalId: true },
    }),
    prisma.professional.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const professionalById = new Map(professionals.map((p) => [p.id, p]));
  const assignedProfessionalId = new Map(assignments.map((a) => [a.positionId, a.professionalId]));

  const occupantByPositionId: Record<string, OrgChartOccupant | null> = {};
  for (const p of positions) {
    const profId = assignedProfessionalId.get(p.id);
    occupantByPositionId[p.id] = profId ? (professionalById.get(profId) ?? null) : null;
  }

  return { positions, professionals, occupantByPositionId };
}
