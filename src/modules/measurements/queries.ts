import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { summarizeMeasurements, type MeasurementSummary } from "@/core/measurements/summary";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";

export interface MeasurementRow {
  id: string;
  referenceDate: Date;
  plannedValue: number;
  measuredValue: number;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export interface ProjectMeasurements {
  rows: MeasurementRow[];
  summary: MeasurementSummary;
}

/** Só quem tem `measurement:manage` (Financeiro/Diretoria/Administrador) vê a seção. */
export async function getProjectMeasurements(
  actor: SessionContext,
  projectId: string,
): Promise<ProjectMeasurements | null> {
  if (!hasPermission(actor, PERMISSIONS.MEASUREMENT_MANAGE)) return null;

  const [allowed, project] = await Promise.all([
    canActorReadProject(actor, projectId),
    prisma.project.findFirst({
      where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
      select: { contractValue: true },
    }),
  ]);
  if (!allowed || !project) return null;

  const measurements = await prisma.measurement.findMany({
    where: { organizationId: actor.organizationId, projectId, deletedAt: null },
    orderBy: { referenceDate: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  const rows: MeasurementRow[] = measurements.map((m) => ({
    id: m.id,
    referenceDate: m.referenceDate,
    plannedValue: Number(m.plannedValue),
    measuredValue: Number(m.measuredValue),
    notes: m.notes,
    status: m.status,
    rejectionReason: m.rejectionReason,
    createdBy: m.createdBy,
    approvedBy: m.approvedBy,
    approvedAt: m.approvedAt,
    createdAt: m.createdAt,
  }));

  const summary = summarizeMeasurements(rows, Number(project.contractValue));

  return { rows, summary };
}
