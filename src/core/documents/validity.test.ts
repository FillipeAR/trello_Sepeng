import { describe, expect, it } from "vitest";
import { DOCUMENT_EXPIRY_WARNING_DAYS, daysUntilExpiry, documentValidityStatus } from "./validity";

const now = new Date("2026-01-01T00:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("daysUntilExpiry", () => {
  it("arredonda pra cima — vence daqui a poucas horas ainda conta como hoje", () => {
    const expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    expect(daysUntilExpiry(expiresAt, now)).toBe(1);
  });

  it("é negativo quando já venceu", () => {
    expect(daysUntilExpiry(daysFromNow(-5), now)).toBe(-5);
  });
});

describe("documentValidityStatus", () => {
  it("OK quando falta mais que a janela de aviso", () => {
    expect(documentValidityStatus(daysFromNow(DOCUMENT_EXPIRY_WARNING_DAYS + 1), now)).toBe("OK");
  });

  it("EXPIRING_SOON exatamente no limiar da janela", () => {
    expect(documentValidityStatus(daysFromNow(DOCUMENT_EXPIRY_WARNING_DAYS), now)).toBe("EXPIRING_SOON");
  });

  it("EXPIRING_SOON logo antes de vencer", () => {
    expect(documentValidityStatus(daysFromNow(1), now)).toBe("EXPIRING_SOON");
  });

  it("EXPIRED no dia seguinte ao vencimento", () => {
    expect(documentValidityStatus(daysFromNow(-1), now)).toBe("EXPIRED");
  });

  it("EXPIRED bem depois de vencido", () => {
    expect(documentValidityStatus(daysFromNow(-90), now)).toBe("EXPIRED");
  });
});
