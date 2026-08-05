import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Suprimentos: fornecedor (cadastro por organização, sem login — mesmo
 * padrão de `Professional`) e pedido de compra (entidade própria ligada à
 * obra e à etapa ativa no momento do pedido). Autorização transversal:
 * `procurement:manage` (hoje: Suprimentos, Diretoria).
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.PROCUREMENT_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar suprimentos.", {
      errors: ["Permissão procurement:manage ausente."],
    });
  }
}

// --- Fornecedores -----------------------------------------------------------

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do fornecedor."),
  category: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  cnpj: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export async function createSupplier(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = supplierSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        organizationId: actor.organizationId,
        name: data.name,
        category: data.category || null,
        phone: data.phone || null,
        email: data.email || null,
        cnpj: data.cnpj || null,
        notes: data.notes || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "supplier.created",
      entityType: "Supplier",
      entityId: supplier.id,
      summary: `Fornecedor "${supplier.name}" cadastrado.`,
      after: supplier,
    });

    return supplier;
  });
}

export async function updateSupplier(actor: SessionContext, input: { supplierId: string; data: unknown }) {
  requireManage(actor);
  const data = supplierSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!supplier) {
      throw new CommandError("Fornecedor não encontrado.", { errors: ["Fornecedor inexistente."] });
    }

    const updated = await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        name: data.name,
        category: data.category || null,
        phone: data.phone || null,
        email: data.email || null,
        cnpj: data.cnpj || null,
        notes: data.notes || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "supplier.updated",
      entityType: "Supplier",
      entityId: supplier.id,
      summary: `Fornecedor "${updated.name}" atualizado.`,
      before: supplier,
      after: updated,
    });

    return updated;
  });
}

export async function deleteSupplier(actor: SessionContext, input: { supplierId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!supplier) {
      throw new CommandError("Fornecedor não encontrado.", { errors: ["Fornecedor inexistente."] });
    }

    const updated = await tx.supplier.update({ where: { id: supplier.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "supplier.deleted",
      entityType: "Supplier",
      entityId: supplier.id,
      summary: `Fornecedor "${supplier.name}" removido do cadastro.`,
      before: supplier,
    });

    return updated;
  });
}

// --- Pedidos de compra --------------------------------------------------------

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

async function getOwnedPurchaseOrder(tx: Tx, actor: SessionContext, purchaseOrderId: string) {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!order) {
    throw new CommandError("Pedido de compra não encontrado.", { errors: ["Pedido inexistente."] });
  }
  const project = await getReadableProject(tx, actor, order.projectId);
  return { order, project };
}

const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Selecione um fornecedor."),
  description: z.string().trim().min(3, "Descreva o que está sendo comprado."),
  value: z.coerce.number().nonnegative().optional().nullable(),
  orderedAt: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date(),
  notes: z.string().trim().optional().nullable(),
});

export async function createPurchaseOrder(
  actor: SessionContext,
  input: { projectId: string; data: unknown },
) {
  requireManage(actor);
  const data = purchaseOrderSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!supplier) {
      throw new CommandError("Fornecedor inválido.", { errors: ["Selecione um fornecedor cadastrado."] });
    }

    // Etapa ativa no momento do pedido — não é escolhida manualmente, é a
    // etapa em que a obra está agora (se houver mais de uma aberta, o
    // primeiro ramo ativo é suficiente pra fins de rastreio).
    const activeStage = await tx.stageInstance.findFirst({
      where: { projectId: project.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { enteredAt: "asc" },
    });

    const order = await tx.purchaseOrder.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        stageInstanceId: activeStage?.id ?? null,
        supplierId: supplier.id,
        description: data.description,
        value: data.value ?? null,
        orderedAt: data.orderedAt ?? new Date(),
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes || null,
        createdById: actor.userId,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "purchase_order.created",
      entityType: "PurchaseOrder",
      entityId: order.id,
      summary: `Pedido de compra "${data.description}" (${supplier.name}) registrado na obra ${project.code}.`,
      after: order,
    });

    return order;
  });
}

export async function updatePurchaseOrder(
  actor: SessionContext,
  input: { purchaseOrderId: string; data: unknown },
) {
  requireManage(actor);
  const data = purchaseOrderSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { order } = await getOwnedPurchaseOrder(tx, actor, input.purchaseOrderId);
    if (order.status !== "PENDING") {
      throw new CommandError("Só é possível editar um pedido pendente.", {
        errors: ["Este pedido já foi entregue ou cancelado."],
      });
    }

    const supplier = await tx.supplier.findFirst({
      where: { id: data.supplierId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!supplier) {
      throw new CommandError("Fornecedor inválido.", { errors: ["Selecione um fornecedor cadastrado."] });
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        supplierId: supplier.id,
        description: data.description,
        value: data.value ?? null,
        orderedAt: data.orderedAt ?? order.orderedAt,
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "purchase_order.updated",
      entityType: "PurchaseOrder",
      entityId: order.id,
      summary: `Pedido de compra "${updated.description}" editado.`,
      before: order,
      after: updated,
    });

    return updated;
  });
}

export async function markPurchaseOrderDelivered(actor: SessionContext, input: { purchaseOrderId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const { order } = await getOwnedPurchaseOrder(tx, actor, input.purchaseOrderId);
    if (order.status !== "PENDING") {
      throw new CommandError("Este pedido não está pendente.", {
        errors: ["Só é possível marcar como entregue um pedido pendente."],
      });
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "purchase_order.delivered",
      entityType: "PurchaseOrder",
      entityId: order.id,
      summary: `Pedido de compra "${order.description}" marcado como entregue.`,
      before: order,
      after: updated,
    });

    return updated;
  });
}

export async function cancelPurchaseOrder(actor: SessionContext, input: { purchaseOrderId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const { order } = await getOwnedPurchaseOrder(tx, actor, input.purchaseOrderId);
    if (order.status !== "PENDING") {
      throw new CommandError("Este pedido não está pendente.", {
        errors: ["Só é possível cancelar um pedido pendente."],
      });
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "purchase_order.cancelled",
      entityType: "PurchaseOrder",
      entityId: order.id,
      summary: `Pedido de compra "${order.description}" cancelado.`,
      before: order,
      after: updated,
    });

    return updated;
  });
}

export async function deletePurchaseOrder(actor: SessionContext, input: { purchaseOrderId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const { order } = await getOwnedPurchaseOrder(tx, actor, input.purchaseOrderId);
    if (order.status !== "PENDING") {
      throw new CommandError("Só é possível excluir um pedido pendente.", {
        errors: ["Este pedido já foi entregue ou cancelado — cancele em vez de excluir."],
      });
    }

    const updated = await tx.purchaseOrder.update({ where: { id: order.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "purchase_order.deleted",
      entityType: "PurchaseOrder",
      entityId: order.id,
      summary: `Pedido de compra "${order.description}" removido.`,
      before: order,
    });

    return updated;
  });
}
