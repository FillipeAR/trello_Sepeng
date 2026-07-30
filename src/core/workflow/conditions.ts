import type { Condition, EvaluationContext } from "./types";

/**
 * Avaliador de condições declarativas. Sem `eval`, sem `new Function` — o fluxo
 * é configurado por usuários, e uma expressão vinda do banco nunca vira código
 * executável.
 */

function resolvePath(path: string, ctx: EvaluationContext): unknown {
  const parts = path.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function compare(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return null;
}

export function evaluateCondition(
  condition: Condition | null | undefined,
  ctx: EvaluationContext,
): boolean {
  if (!condition) return true;

  switch (condition.op) {
    case "always":
      return true;
    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, ctx));
    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, ctx));
    case "not":
      return !evaluateCondition(condition.condition, ctx);
    case "isEmpty":
      return isEmpty(resolvePath(condition.path, ctx));
    case "isNotEmpty":
      return !isEmpty(resolvePath(condition.path, ctx));
    case "eq":
      return resolvePath(condition.path, ctx) === condition.value;
    case "neq":
      return resolvePath(condition.path, ctx) !== condition.value;
    case "in":
      return condition.value.includes(resolvePath(condition.path, ctx));
    case "nin":
      return !condition.value.includes(resolvePath(condition.path, ctx));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const diff = compare(resolvePath(condition.path, ctx), condition.value);
      if (diff === null) return false;
      if (condition.op === "gt") return diff > 0;
      if (condition.op === "gte") return diff >= 0;
      if (condition.op === "lt") return diff < 0;
      return diff <= 0;
    }
    default: {
      // Condição desconhecida vinda do banco: nega, nunca libera por omissão.
      return false;
    }
  }
}

/** Valida a forma de uma condição antes de gravá-la (editor de fluxos). */
export function isValidCondition(value: unknown): value is Condition {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  switch (c.op) {
    case "always":
      return true;
    case "and":
    case "or":
      return Array.isArray(c.conditions) && c.conditions.every(isValidCondition);
    case "not":
      return isValidCondition(c.condition);
    case "isEmpty":
    case "isNotEmpty":
      return typeof c.path === "string";
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return typeof c.path === "string" && "value" in c;
    case "in":
    case "nin":
      return typeof c.path === "string" && Array.isArray(c.value);
    default:
      return false;
  }
}
