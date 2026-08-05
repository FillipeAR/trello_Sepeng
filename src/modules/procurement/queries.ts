import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { isPurchaseOrderLate, threatensSchedule } from "@/core/procurement/impact";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";

/** Cadastro ativo de fornecedores — fonte do seletor no pedido de compra. */
export async function listSuppliers(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.PROCUREMENT_MANAGE)) return [];
  return prisma.supplier.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export interface PurchaseOrderRow {
  id: string;
  description: string;
  value: number | null;
  orderedAt: Date;
  expectedDeliveryDate: Date;
  deliveredAt: Date | null;
  status: "PENDING" | "DELIVERED" | "CANCELLED";
  notes: string | null;
  supplierName: string;
  isLate: boolean;
  threatensSchedule: boolean;
}

/** Só quem tem `procurement:manage` (hoje: Suprimentos, Diretoria, Administrador) vê a seção. */
export async function getProjectPurchaseOrders(
  actor: SessionContext,
  projectId: string,
): Promise<PurchaseOrderRow[] | null> {
  if (!hasPermission(actor, PERMISSIONS.PROCUREMENT_MANAGE)) return null;

  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return null;

  const orders = await prisma.purchaseOrder.findMany({
    where: { organizationId: actor.organizationId, projectId, deletedAt: null },
    orderBy: { expectedDeliveryDate: "asc" },
    include: {
      supplier: { select: { name: true } },
      stageInstance: { select: { status: true } },
    },
  });

  const now = new Date();

  return orders.map((o) => {
    const like = { status: o.status, expectedDeliveryDate: o.expectedDeliveryDate };
    const linkedStageIsOpen = o.stageInstance
      ? o.stageInstance.status === "PENDING" || o.stageInstance.status === "IN_PROGRESS"
      : false;

    return {
      id: o.id,
      description: o.description,
      value: o.value ? Number(o.value) : null,
      orderedAt: o.orderedAt,
      expectedDeliveryDate: o.expectedDeliveryDate,
      deliveredAt: o.deliveredAt,
      status: o.status,
      notes: o.notes,
      supplierName: o.supplier.name,
      isLate: isPurchaseOrderLate(like, now),
      threatensSchedule: threatensSchedule(like, linkedStageIsOpen, now),
    };
  });
}
