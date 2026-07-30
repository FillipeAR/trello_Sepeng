import { describe, expect, it } from "vitest";
import { evaluateCondition, isValidCondition } from "./conditions";
import type { Condition, EvaluationContext } from "./types";

const ctx: EvaluationContext = {
  field: { gerente: "user-9", equipe: ["a", "b"], observacao: "  " },
  project: { contractValue: 250_000, status: "ACTIVE" },
  actor: { departmentId: "dep-rh" },
};

describe("evaluateCondition", () => {
  it("condição ausente libera", () => {
    expect(evaluateCondition(null, ctx)).toBe(true);
  });

  it("comparações numéricas", () => {
    expect(evaluateCondition({ op: "gt", path: "project.contractValue", value: 100 }, ctx)).toBe(true);
    expect(evaluateCondition({ op: "lt", path: "project.contractValue", value: 100 }, ctx)).toBe(false);
    expect(evaluateCondition({ op: "gte", path: "project.contractValue", value: 250_000 }, ctx)).toBe(true);
  });

  it("igualdade e pertinência", () => {
    expect(evaluateCondition({ op: "eq", path: "project.status", value: "ACTIVE" }, ctx)).toBe(true);
    expect(evaluateCondition({ op: "in", path: "project.status", value: ["ACTIVE", "DONE"] }, ctx)).toBe(true);
    expect(evaluateCondition({ op: "nin", path: "project.status", value: ["DONE"] }, ctx)).toBe(true);
  });

  it("vazio considera string em branco e array vazio", () => {
    expect(evaluateCondition({ op: "isEmpty", path: "field.observacao" }, ctx)).toBe(true);
    expect(evaluateCondition({ op: "isNotEmpty", path: "field.equipe" }, ctx)).toBe(true);
    expect(evaluateCondition({ op: "isEmpty", path: "field.inexistente" }, ctx)).toBe(true);
  });

  it("combinadores", () => {
    const cond: Condition = {
      op: "and",
      conditions: [
        { op: "isNotEmpty", path: "field.gerente" },
        { op: "or", conditions: [{ op: "eq", path: "project.status", value: "X" }, { op: "always" }] },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
    expect(evaluateCondition({ op: "not", condition: cond }, ctx)).toBe(false);
  });

  it("caminho inexistente não explode", () => {
    expect(evaluateCondition({ op: "eq", path: "a.b.c.d", value: 1 }, ctx)).toBe(false);
  });

  it("operador desconhecido nega em vez de liberar", () => {
    const suspeita = { op: "sudo", path: "x" } as unknown as Condition;
    expect(evaluateCondition(suspeita, ctx)).toBe(false);
  });

  it("comparar tipos incompatíveis nega", () => {
    expect(evaluateCondition({ op: "gt", path: "project.status", value: 10 }, ctx)).toBe(false);
  });
});

describe("isValidCondition", () => {
  it("aceita condições bem formadas", () => {
    expect(isValidCondition({ op: "always" })).toBe(true);
    expect(isValidCondition({ op: "eq", path: "field.x", value: 1 })).toBe(true);
    expect(isValidCondition({ op: "and", conditions: [{ op: "always" }] })).toBe(true);
  });

  it("rejeita malformadas", () => {
    expect(isValidCondition(null)).toBe(false);
    expect(isValidCondition({ op: "eq", path: "field.x" })).toBe(false);
    expect(isValidCondition({ op: "in", path: "field.x", value: "nao-array" })).toBe(false);
    expect(isValidCondition({ op: "hack" })).toBe(false);
  });
});
