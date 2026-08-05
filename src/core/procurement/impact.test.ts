import { describe, expect, it } from "vitest";
import { daysLate, isPurchaseOrderLate, threatensSchedule, type PurchaseOrderLike } from "./impact";

const now = new Date("2026-01-15T00:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("isPurchaseOrderLate", () => {
  it("não está atrasado se a entrega prevista ainda não passou", () => {
    const order: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(1) };
    expect(isPurchaseOrderLate(order, now)).toBe(false);
  });

  it("está atrasado quando pendente e a data prevista já passou", () => {
    const order: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(-3) };
    expect(isPurchaseOrderLate(order, now)).toBe(true);
  });

  it("entregue não é atraso mesmo com data prevista vencida", () => {
    const order: PurchaseOrderLike = { status: "DELIVERED", expectedDeliveryDate: daysFromNow(-10) };
    expect(isPurchaseOrderLate(order, now)).toBe(false);
  });

  it("cancelado não é atraso", () => {
    const order: PurchaseOrderLike = { status: "CANCELLED", expectedDeliveryDate: daysFromNow(-10) };
    expect(isPurchaseOrderLate(order, now)).toBe(false);
  });
});

describe("daysLate", () => {
  it("zero quando não está atrasado", () => {
    const order: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(5) };
    expect(daysLate(order, now)).toBe(0);
  });

  it("conta os dias corridos de atraso", () => {
    const order: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(-7) };
    expect(daysLate(order, now)).toBe(7);
  });
});

describe("threatensSchedule", () => {
  const lateOrder: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(-2) };
  const onTimeOrder: PurchaseOrderLike = { status: "PENDING", expectedDeliveryDate: daysFromNow(2) };

  it("ameaça o prazo quando atrasado e a etapa vinculada ainda está aberta", () => {
    expect(threatensSchedule(lateOrder, true, now)).toBe(true);
  });

  it("não ameaça se a etapa vinculada já foi concluída", () => {
    expect(threatensSchedule(lateOrder, false, now)).toBe(false);
  });

  it("não ameaça se o pedido nem está atrasado", () => {
    expect(threatensSchedule(onTimeOrder, true, now)).toBe(false);
  });
});
