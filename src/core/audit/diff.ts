/** Diff raso entre dois snapshots de uma entidade. Alimenta a coluna `diffJson`. */

export type FieldDiff = Record<string, { before: unknown; after: unknown }>;

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (typeof value === "object" && value !== null && "toString" in value) {
    // Prisma.Decimal e similares
    const proto = Object.getPrototypeOf(value);
    if (proto?.constructor?.name === "Decimal") return String(value);
  }
  return value;
}

export function buildDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldDiff {
  const diff: FieldDiff = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    const b = normalize(before?.[key]);
    const a = normalize(after?.[key]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }

  return diff;
}

/** Serializa uma entidade do Prisma para gravação em JSON de auditoria. */
export function serializeForAudit(entity: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(entity, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}
