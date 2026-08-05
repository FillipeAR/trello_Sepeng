/**
 * Atraso de pedido de compra e impacto no cronograma — sem Prisma, sem I/O,
 * e sem tocar em `core/workflow/engine.ts`. O engine continua sem saber que
 * suprimentos existe; quem lê `isPurchaseOrderLate`/`threatensSchedule` é a
 * query de leitura da obra, só pra exibir um aviso. Nenhum `dueAt` de etapa
 * é alterado automaticamente por atraso de fornecedor — empurrar prazo
 * sozinho é decisão de negócio que não estava clara no escopo do MVP.
 */

export type PurchaseOrderStatus = "PENDING" | "DELIVERED" | "CANCELLED";

export interface PurchaseOrderLike {
  status: PurchaseOrderStatus;
  expectedDeliveryDate: Date;
}

/** Só "atrasado" enquanto ainda está pendente — entregue ou cancelado não é mais risco. */
export function isPurchaseOrderLate(order: PurchaseOrderLike, now: Date): boolean {
  return order.status === "PENDING" && order.expectedDeliveryDate.getTime() < now.getTime();
}

export function daysLate(order: PurchaseOrderLike, now: Date): number {
  if (!isPurchaseOrderLate(order, now)) return 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.ceil((now.getTime() - order.expectedDeliveryDate.getTime()) / MS_PER_DAY);
}

/**
 * Pedido atrasado só é risco de cronograma pra obra se a etapa a que ele
 * está vinculado ainda está aberta — atraso numa etapa já concluída é
 * histórico, não ameaça mais o prazo de nada.
 */
export function threatensSchedule(
  order: PurchaseOrderLike,
  linkedStageIsOpen: boolean,
  now: Date,
): boolean {
  return linkedStageIsOpen && isPurchaseOrderLate(order, now);
}
