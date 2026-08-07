import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";
import type { FlatTeamPosition } from "./tree";

export interface TeamOccupant {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

export interface TeamProfessional {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  company: string | null;
  area: string | null;
  allocated: boolean;
}

export interface TeamStructure {
  positions: FlatTeamPosition[];
  occupantByPositionId: Record<string, TeamOccupant | null>;
  professionals: TeamProfessional[];
}

/** Estrutura completa da equipe de uma obra — cargos, hierarquia e quem está disponível. */
export async function getTeamStructure(actor: SessionContext, projectId: string): Promise<TeamStructure | null> {
  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return null;

  const [rows, professionals] = await Promise.all([
    prisma.teamPosition.findMany({
      where: { organizationId: actor.organizationId, projectId, deletedAt: null },
      include: { professional: { select: { id: true, name: true, role: true, avatarUrl: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.professional.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const allocatedIds = new Set(rows.map((r) => r.professionalId).filter((id): id is string => Boolean(id)));

  const positions: FlatTeamPosition[] = rows.map((r) => ({
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

  const occupantByPositionId: Record<string, TeamOccupant | null> = {};
  for (const r of rows) {
    occupantByPositionId[r.id] = r.professional
      ? { id: r.professional.id, name: r.professional.name, role: r.professional.role, avatarUrl: r.professional.avatarUrl }
      : null;
  }

  return {
    positions,
    occupantByPositionId,
    professionals: professionals.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      email: p.email,
      phone: p.phone,
      avatarUrl: p.avatarUrl,
      company: p.company,
      area: p.area,
      allocated: allocatedIds.has(p.id),
    })),
  };
}
