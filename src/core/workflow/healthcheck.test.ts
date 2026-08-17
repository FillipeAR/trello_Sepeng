import { describe, expect, it } from "vitest";
import { checkWorkflowHealth } from "./healthcheck";
import { makeAction, makeLinearSnapshot, makeParallelSnapshot, makeStage } from "./fixtures";
import type { WorkflowSnapshot } from "./types";

describe("checkWorkflowHealth", () => {
  it("não encontra problema num fluxo linear saudável", () => {
    expect(checkWorkflowHealth(makeLinearSnapshot())).toHaveLength(0);
  });

  it("não encontra problema num fluxo com bifurcação saudável", () => {
    expect(checkWorkflowHealth(makeParallelSnapshot())).toHaveLength(0);
  });

  it('acusa completionMode "EXTERNAL" sem externalCompletionPath', () => {
    const stage = makeStage({ completionMode: "EXTERNAL", externalCompletionPath: null });
    const snapshot: WorkflowSnapshot = { versionId: "v", version: 1, stages: [stage], transitions: [] };

    const issues = checkWorkflowHealth(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", stageId: stage.id });
    expect(issues[0].message).toMatch(/EXTERNAL/);
  });

  it("acusa etapa não-final sem nenhuma ação", () => {
    const stage = makeStage({ isFinal: false, actions: [] });
    const snapshot: WorkflowSnapshot = { versionId: "v", version: 1, stages: [stage], transitions: [] };

    const issues = checkWorkflowHealth(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/sem nenhuma ação/);
  });

  it("acusa etapa PARALLEL com menos de 2 ramos configurados", () => {
    const stage = makeStage({ mode: "PARALLEL", isFinal: false });
    const snapshot: WorkflowSnapshot = {
      versionId: "v",
      version: 1,
      stages: [stage],
      transitions: [{ id: "t1", fromStageId: stage.id, toStageId: "algum-destino", actionId: null, condition: null, order: 0 }],
    };

    const issues = checkWorkflowHealth(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/bifurcação exige/);
  });

  it("acusa transição coringa sequestrando o destino explícito de uma ação (regressão real: Devolver na Diretoria indo pra Segurança)", () => {
    const stage = makeStage({
      id: "s-diretoria",
      key: "diretoria",
      name: "Diretoria",
      mode: "PARALLEL",
      isFinal: false,
      actions: [
        makeAction({ id: "a-dir-next", key: "avancar", kind: "ADVANCE" }),
        makeAction({ id: "a-dir-back", key: "devolver", kind: "RETURN", targetStageId: "s-orcamento" }),
      ],
    });
    const snapshot: WorkflowSnapshot = {
      versionId: "v",
      version: 1,
      stages: [stage],
      transitions: [
        { id: "t-rh", fromStageId: stage.id, toStageId: "s-rh", actionId: "a-dir-next", condition: null, order: 0 },
        { id: "t-seg", fromStageId: stage.id, toStageId: "s-seguranca", actionId: "a-dir-next", condition: null, order: 1 },
        // Transição órfã: sem actionId, incondicional — exatamente o bug já achado em produção.
        { id: "t-wild", fromStageId: stage.id, toStageId: "s-seguranca", actionId: null, condition: null, order: 2 },
      ],
    };

    const issues = checkWorkflowHealth(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toMatch(/coringa/);
  });

  it("não acusa a ação ADVANCE de uma bifurcação PARALLEL por causa da coringa (ela vira só mais um ramo, não uma substituição)", () => {
    const stage = makeStage({
      id: "s-diretoria",
      mode: "PARALLEL",
      isFinal: false,
      actions: [makeAction({ id: "a-dir-next", key: "avancar", kind: "ADVANCE" })],
    });
    const snapshot: WorkflowSnapshot = {
      versionId: "v",
      version: 1,
      stages: [stage],
      transitions: [
        { id: "t-rh", fromStageId: stage.id, toStageId: "s-rh", actionId: "a-dir-next", condition: null, order: 0 },
        { id: "t-wild", fromStageId: stage.id, toStageId: "s-seguranca", actionId: null, condition: null, order: 1 },
      ],
    };

    expect(checkWorkflowHealth(snapshot)).toHaveLength(0);
  });
});
