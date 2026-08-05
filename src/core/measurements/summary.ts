/**
 * Agregação pura de orçamento vs. custo real — sem Prisma, sem I/O. Só
 * medição APROVADA entra na conta: PENDING ainda não é fato consumado e
 * REJECTED não vale. `plannedValue`/`measuredValue` já vêm como `number`
 * (conversão do `Decimal` do Prisma é responsabilidade de quem consulta).
 */

export type MeasurementStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface MeasurementLike {
  status: MeasurementStatus;
  plannedValue: number;
  measuredValue: number;
}

export interface MeasurementSummary {
  totalPlanned: number;
  totalMeasured: number;
  /** measuredValue - plannedValue das aprovadas; positivo = executado acima do previsto. */
  variance: number;
  contractValue: number;
  /** % do valor de contrato já medido/aprovado. */
  percentOfContractMeasured: number;
  pendingCount: number;
}

export function summarizeMeasurements(
  measurements: readonly MeasurementLike[],
  contractValue: number,
): MeasurementSummary {
  const approved = measurements.filter((m) => m.status === "APPROVED");
  const totalPlanned = approved.reduce((sum, m) => sum + m.plannedValue, 0);
  const totalMeasured = approved.reduce((sum, m) => sum + m.measuredValue, 0);

  return {
    totalPlanned,
    totalMeasured,
    variance: totalMeasured - totalPlanned,
    contractValue,
    percentOfContractMeasured: contractValue > 0 ? (totalMeasured / contractValue) * 100 : 0,
    pendingCount: measurements.filter((m) => m.status === "PENDING").length,
  };
}
