import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/core/rbac/permissions";
import {
  canTransition,
  computeDueDate,
  getAvailableActions,
  getInitialStage,
  isSlaBreached,
  resolveForkTargets,
  resolveTargetStage,
  shouldJoin,
  validateStageFields,
  workflowProgress,
} from "./engine";
import { makeActor, makeLinearSnapshot, makeParallelSnapshot, makeStage, makeField, makeAction } from "./fixtures";
import type { EvaluationContext, WorkflowSnapshot } from "./types";

const emptyCtx: EvaluationContext = { field: {}, project: {}, actor: {} };

describe("etapa inicial", () => {
  it("usa a etapa marcada como inicial", () => {
    expect(getInitialStage(makeLinearSnapshot()).key).toBe("orcamento");
  });

  it("cai na menor ordem quando nenhuma está marcada", () => {
    const snapshot: WorkflowSnapshot = {
      versionId: "v",
      version: 1,
      stages: [makeStage({ id: "b", order: 5 }), makeStage({ id: "a", order: 1 })],
      transitions: [],
    };
    expect(getInitialStage(snapshot).id).toBe("a");
  });
});

describe("validação de campos da etapa", () => {
  it("bloqueia campo obrigatório vazio", () => {
    const stage = makeLinearSnapshot().stages[1];
    const errors = validateStageFields(stage, {});
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldKey).toBe("gerente");
  });

  it("aceita quando o obrigatório está preenchido", () => {
    const stage = makeLinearSnapshot().stages[1];
    expect(validateStageFields(stage, { gerente: "user-9" })).toHaveLength(0);
  });

  it("rejeita número inválido", () => {
    const stage = makeLinearSnapshot().stages[1];
    const errors = validateStageFields(stage, { gerente: "u", quantidade: "doze" });
    expect(errors.map((e) => e.fieldKey)).toContain("quantidade");
  });

  it("rejeita opção fora da lista de um SELECT", () => {
    const stage = makeStage({
      fields: [
        makeField({
          key: "prioridade",
          type: "SELECT",
          options: [
            { value: "alta", label: "Alta" },
            { value: "baixa", label: "Baixa" },
          ],
        }),
      ],
    });
    expect(validateStageFields(stage, { prioridade: "media" })).toHaveLength(1);
    expect(validateStageFields(stage, { prioridade: "alta" })).toHaveLength(0);
  });

  it("trata string em branco como não preenchida", () => {
    const stage = makeStage({
      fields: [makeField({ key: "obs", label: "Observação", required: true })],
    });
    expect(validateStageFields(stage, { obs: "   " })).toHaveLength(1);
  });
});

describe("permissões sobre a etapa", () => {
  const snapshot = makeLinearSnapshot();

  it("libera quem tem a permissão e está no departamento da etapa", () => {
    const actor = makeActor({ departmentId: "dep-diretoria" });
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor,
      fieldValues: { gerente: "user-9" },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.targetStages.map((s) => s.key)).toEqual(["rh"]);
  });

  it("bloqueia usuário de outro departamento", () => {
    const actor = makeActor({ departmentId: "dep-rh" });
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor,
      fieldValues: { gerente: "user-9" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errors.join(" ")).toContain("outro departamento");
  });

  it("bloqueia quem não tem a permissão exigida pela ação", () => {
    const actor = makeActor({ departmentId: "dep-diretoria", permissions: [] });
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor,
      fieldValues: { gerente: "user-9" },
    });
    expect(decision.allowed).toBe(false);
  });

  it("administrador com workflow:manage destrava qualquer etapa", () => {
    const actor = makeActor({
      departmentId: "dep-financeiro",
      permissions: [PERMISSIONS.WORKFLOW_MANAGE],
    });
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor,
      fieldValues: { gerente: "user-9" },
    });
    expect(decision.allowed).toBe(true);
  });
});

describe("campos obrigatórios x tipo de ação", () => {
  const snapshot = makeLinearSnapshot();

  it("avançar exige os campos obrigatórios", () => {
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor: makeActor({ departmentId: "dep-diretoria" }),
      fieldValues: {},
    });
    expect(decision.allowed).toBe(false);
    expect(decision.fieldErrors).toHaveLength(1);
  });

  it("devolver não exige os campos, mas exige justificativa", () => {
    const actor = makeActor({
      departmentId: "dep-diretoria",
      permissions: [PERMISSIONS.STAGE_ROLLBACK],
    });

    const semComentario = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "devolver",
      actor,
      fieldValues: {},
    });
    expect(semComentario.allowed).toBe(false);
    expect(semComentario.fieldErrors).toHaveLength(0);
    expect(semComentario.errors.join(" ")).toContain("justificativa");

    const comComentario = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "devolver",
      actor,
      fieldValues: {},
      comment: "Faltou o escopo detalhado.",
    });
    expect(comComentario.allowed).toBe(true);
    expect(comComentario.targetStages.map((s) => s.key)).toEqual(["orcamento"]);
  });
});

describe("resolução do destino", () => {
  it("segue a ordem das etapas quando não há transição explícita", () => {
    const snapshot = makeLinearSnapshot();
    const target = resolveTargetStage(snapshot, snapshot.stages[0], "a-orc-next", emptyCtx);
    expect(target?.key).toBe("diretoria");
  });

  it("respeita transição condicional antes da ordem natural", () => {
    const snapshot = makeLinearSnapshot();
    snapshot.transitions = [
      {
        id: "t1",
        fromStageId: "s-orcamento",
        toStageId: "s-rh",
        actionId: null,
        condition: { op: "gt", path: "project.contractValue", value: 1_000_000 },
        order: 0,
      },
    ];

    const grande = resolveTargetStage(snapshot, snapshot.stages[0], "a-orc-next", {
      ...emptyCtx,
      project: { contractValue: 5_000_000 },
    });
    expect(grande?.key).toBe("rh");

    const pequena = resolveTargetStage(snapshot, snapshot.stages[0], "a-orc-next", {
      ...emptyCtx,
      project: { contractValue: 100 },
    });
    expect(pequena?.key).toBe("diretoria");
  });

  it("etapa final não aponta para lugar nenhum", () => {
    const snapshot = makeLinearSnapshot();
    const target = resolveTargetStage(snapshot, snapshot.stages[2], "a-rh-finish", emptyCtx);
    expect(target).toBeNull();
  });
});

describe("reconfiguração do fluxo sem tocar em código", () => {
  it("inserir Jurídico entre Orçamento e Diretoria muda o destino", () => {
    const snapshot = makeLinearSnapshot();
    snapshot.stages.push(
      makeStage({
        id: "s-juridico",
        key: "juridico",
        name: "Jurídico",
        displayStatus: "Contrato Validado",
        order: 0.5,
        departmentId: "dep-juridico",
        actions: [makeAction({ id: "a-jur-next", key: "avancar" })],
      }),
    );

    const target = resolveTargetStage(snapshot, snapshot.stages[0], "a-orc-next", emptyCtx);
    expect(target?.key).toBe("juridico");
  });
});

describe("ações disponíveis", () => {
  it("marca como desabilitada a ação sem permissão, com motivo", () => {
    const snapshot = makeLinearSnapshot();
    const actions = getAvailableActions(
      snapshot,
      "s-diretoria",
      makeActor({ departmentId: "dep-diretoria", permissions: [PERMISSIONS.STAGE_COMPLETE] }),
    );

    const avancar = actions.find((a) => a.key === "avancar");
    const devolver = actions.find((a) => a.key === "devolver");

    expect(avancar?.enabled).toBe(true);
    expect(devolver?.enabled).toBe(false);
    expect(devolver?.disabledReason).toBeTruthy();
  });
});

describe("SLA e progresso", () => {
  it("calcula o vencimento a partir das horas de SLA", () => {
    const stage = makeLinearSnapshot().stages[1];
    const entered = new Date("2026-01-01T00:00:00Z");
    expect(computeDueDate(stage, entered)?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  it("etapa sem SLA nunca vence", () => {
    const stage = makeLinearSnapshot().stages[0];
    expect(computeDueDate(stage, new Date())).toBeNull();
    expect(isSlaBreached(null)).toBe(false);
  });

  it("detecta SLA estourado", () => {
    const due = new Date("2026-01-01T00:00:00Z");
    expect(isSlaBreached(due, new Date("2026-01-02T00:00:00Z"))).toBe(true);
    expect(isSlaBreached(due, new Date("2025-12-31T00:00:00Z"))).toBe(false);
  });

  it("progresso vai de 0 na primeira etapa até perto de 100 na última", () => {
    const snapshot = makeLinearSnapshot();
    expect(workflowProgress(snapshot, ["s-orcamento"])).toBe(0);
    expect(workflowProgress(snapshot, ["s-diretoria"])).toBe(50);
  });

  it("sem etapa ativa (fluxo nunca iniciado) o progresso é 0 — encerrado é responsabilidade do chamador", () => {
    const snapshot = makeLinearSnapshot();
    expect(workflowProgress(snapshot, [])).toBe(0);
  });

  it("com ramos paralelos, usa o menos avançado", () => {
    const snapshot = makeParallelSnapshot();
    // RH e Segurança têm a mesma order (2); ambos ativos não muda o resultado.
    expect(workflowProgress(snapshot, ["s-rh", "s-seguranca"])).toBe(
      workflowProgress(snapshot, ["s-rh"]),
    );
    // Um ramo ainda em Diretoria (order 1) e outro já avançado (order 2, hipotético
    // fora do fluxo real, só para exercitar o mínimo): o resultado usa o menor.
    expect(workflowProgress(snapshot, ["s-diretoria", "s-financeiro"])).toBe(
      workflowProgress(snapshot, ["s-diretoria"]),
    );
  });
});

describe("bifurcação e convergência (etapas paralelas)", () => {
  it("etapa PARALLEL abre todos os ramos com condição satisfeita", () => {
    const snapshot = makeParallelSnapshot();
    const targets = resolveForkTargets(snapshot, snapshot.stages[1], "a-dir-next", emptyCtx);
    expect(targets.map((s) => s.key).sort()).toEqual(["rh", "seguranca"]);
  });

  it("canTransition numa etapa PARALLEL devolve os dois ramos em targetStages", () => {
    const snapshot = makeParallelSnapshot();
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor: makeActor({ departmentId: "dep-diretoria" }),
      fieldValues: {},
    });
    expect(decision.allowed).toBe(true);
    expect(decision.targetStages.map((s) => s.key).sort()).toEqual(["rh", "seguranca"]);
  });

  it("etapa PARALLEL sem transições configuradas é um erro de configuração, não um fallback silencioso", () => {
    const snapshot = makeParallelSnapshot();
    snapshot.transitions = [];
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "avancar",
      actor: makeActor({ departmentId: "dep-diretoria" }),
      fieldValues: {},
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errors.join(" ")).toContain("ramos");
  });

  it("joinPolicy ALL só libera quando todos os irmãos concluíram", () => {
    expect(shouldJoin("ALL", ["COMPLETED", "IN_PROGRESS"])).toBe(false);
    expect(shouldJoin("ALL", ["COMPLETED", "COMPLETED"])).toBe(true);
    expect(shouldJoin("ALL", ["COMPLETED", "SKIPPED"])).toBe(true);
  });

  it("joinPolicy ANY libera assim que o próprio ramo conclui", () => {
    expect(shouldJoin("ANY", ["COMPLETED"])).toBe(true);
    expect(shouldJoin("ANY", ["COMPLETED", "IN_PROGRESS", "PENDING"])).toBe(true);
  });

  it("devolver a partir de uma etapa PARALLEL não bifurca — vai para um único destino", () => {
    const snapshot = makeParallelSnapshot();
    snapshot.stages[1].actions.push(
      makeAction({
        id: "a-dir-back",
        key: "devolver",
        kind: "RETURN",
        targetStageId: "s-orcamento",
        requiresComment: true,
      }),
    );
    const decision = canTransition({
      snapshot,
      currentStageId: "s-diretoria",
      actionKey: "devolver",
      actor: makeActor({ departmentId: "dep-diretoria" }),
      fieldValues: {},
      comment: "Faltou revisar o orçamento.",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.targetStages.map((s) => s.key)).toEqual(["orcamento"]);
  });
});

describe("entradas inválidas", () => {
  const snapshot = makeLinearSnapshot();

  it("etapa inexistente é negada", () => {
    const decision = canTransition({
      snapshot,
      currentStageId: "nao-existe",
      actionKey: "avancar",
      actor: makeActor(),
      fieldValues: {},
    });
    expect(decision.allowed).toBe(false);
  });

  it("ação inexistente é negada", () => {
    const decision = canTransition({
      snapshot,
      currentStageId: "s-orcamento",
      actionKey: "teletransportar",
      actor: makeActor({ departmentId: "dep-orcamento" }),
      fieldValues: {},
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errors.join(" ")).toContain("não existe");
  });
});
