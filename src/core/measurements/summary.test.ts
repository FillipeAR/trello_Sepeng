import { describe, expect, it } from "vitest";
import { summarizeMeasurements, type MeasurementLike } from "./summary";

describe("summarizeMeasurements", () => {
  it("some vazio quando não há medições", () => {
    const summary = summarizeMeasurements([], 100_000);
    expect(summary).toMatchObject({
      totalPlanned: 0,
      totalMeasured: 0,
      variance: 0,
      percentOfContractMeasured: 0,
      pendingCount: 0,
    });
  });

  it("ignora medições PENDING e REJECTED no total, mas conta PENDING à parte", () => {
    const measurements: MeasurementLike[] = [
      { status: "PENDING", plannedValue: 1000, measuredValue: 900 },
      { status: "REJECTED", plannedValue: 500, measuredValue: 500 },
    ];
    const summary = summarizeMeasurements(measurements, 100_000);
    expect(summary.totalPlanned).toBe(0);
    expect(summary.totalMeasured).toBe(0);
    expect(summary.pendingCount).toBe(1);
  });

  it("soma só as APPROVED e calcula variação", () => {
    const measurements: MeasurementLike[] = [
      { status: "APPROVED", plannedValue: 10_000, measuredValue: 12_000 },
      { status: "APPROVED", plannedValue: 5_000, measuredValue: 4_000 },
      { status: "PENDING", plannedValue: 999, measuredValue: 999 },
    ];
    const summary = summarizeMeasurements(measurements, 100_000);
    expect(summary.totalPlanned).toBe(15_000);
    expect(summary.totalMeasured).toBe(16_000);
    expect(summary.variance).toBe(1_000);
    expect(summary.percentOfContractMeasured).toBeCloseTo(16, 5);
  });

  it("não divide por zero quando o contrato não tem valor", () => {
    const measurements: MeasurementLike[] = [
      { status: "APPROVED", plannedValue: 1000, measuredValue: 1000 },
    ];
    expect(summarizeMeasurements(measurements, 0).percentOfContractMeasured).toBe(0);
  });
});
