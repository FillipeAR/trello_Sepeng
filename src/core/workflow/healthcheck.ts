import type { WorkflowSnapshot } from "./types";

export interface WorkflowHealthIssue {
  severity: "error" | "warning";
  stageId: string;
  stageKey: string;
  stageName: string;
  message: string;
}

/**
 * Checagens estruturais estáticas sobre uma `WorkflowSnapshot` publicada —
 * não substitui `canTransition` (que decide caso a caso, com dado real da
 * obra), serve pra pegar configuração quebrada *antes* que uma obra tropece
 * nela. Nasceu de duas regressões silenciosas reais já vistas em produção:
 * `completionMode: "EXTERNAL"` perdendo `externalCompletionPath` numa
 * clonagem de rascunho, e uma `WorkflowTransition` "coringa" (sem ação
 * associada) engolindo o destino explícito de uma ação de outra etapa.
 */
export function checkWorkflowHealth(snapshot: WorkflowSnapshot): WorkflowHealthIssue[] {
  const issues: WorkflowHealthIssue[] = [];

  const issue = (stage: WorkflowSnapshot["stages"][number], severity: "error" | "warning", message: string) => {
    issues.push({ severity, stageId: stage.id, stageKey: stage.key, stageName: stage.name, message });
  };

  for (const stage of snapshot.stages) {
    // 1. completionMode EXTERNAL sem rota configurada: o botão de redirect
    //    não tem pra onde mandar o usuário.
    if (stage.completionMode === "EXTERNAL" && !stage.externalCompletionPath) {
      issue(stage, "error", 'completionMode "EXTERNAL" sem externalCompletionPath — o redirect não tem destino.');
    }

    // 2. Etapa não-final sem nenhuma ação: obra que chegar aqui trava, sem
    //    jeito de sair (mesma checagem que publishVersion já faz, repetida
    //    aqui pra pegar caso algo escape por fora do fluxo de publicação).
    if (!stage.isFinal && stage.actions.length === 0) {
      issue(stage, "error", "Etapa não-final sem nenhuma ação — qualquer obra que chegar aqui fica travada.");
    }

    const outgoing = snapshot.transitions.filter((t) => t.fromStageId === stage.id);

    // 3. PARALLEL depende inteiramente de WorkflowTransition explícita pra
    //    bifurcar (não cai no fallback "próxima etapa por order" como o
    //    modo SEQUENTIAL) — com menos de 2 ramos configurados não bifurca
    //    de verdade.
    if (stage.mode === "PARALLEL" && !stage.isFinal) {
      const distinctTargets = new Set(outgoing.map((t) => t.toStageId));
      if (distinctTargets.size < 2) {
        issue(
          stage,
          "error",
          `Etapa PARALLEL com ${distinctTargets.size} ramo(s) configurado(s) via WorkflowTransition — bifurcação exige pelo menos 2.`,
        );
      }
    }

    // 4. Transição "coringa" (sem actionId — vale pra qualquer ação da
    //    etapa) incondicional. Ela é avaliada *antes* do targetStageId da
    //    ação (ver `resolveTargetStage`), então qualquer ação cujo
    //    targetStageId aponte pra outro lugar nunca alcança seu destino de
    //    verdade — silenciosamente. Não se aplica a ADVANCE numa etapa
    //    PARALLEL (que bifurca por `resolveForkTargets`, onde a coringa só
    //    vira um ramo a mais, não uma substituição).
    const wildcards = outgoing.filter(
      (t) => t.actionId === null && (t.condition === null || t.condition.op === "always"),
    );
    if (wildcards.length > 0) {
      const [wildcard] = wildcards;
      for (const action of stage.actions) {
        const goesThroughFork = action.kind === "ADVANCE" && stage.mode === "PARALLEL";
        if (!goesThroughFork && action.targetStageId && action.targetStageId !== wildcard.toStageId) {
          issue(
            stage,
            "error",
            `Ação "${action.label}" aponta pra outra etapa (targetStageId), mas uma transição coringa (sem ação associada) nesta etapa é avaliada primeiro e sempre vence — o destino configurado na ação nunca é alcançado.`,
          );
        }
      }
      if (wildcards.length > 1) {
        issue(stage, "warning", `${wildcards.length} transições coringa incondicionais na mesma etapa — só a primeira por ordem nunca é alcançada pelas outras.`);
      }
    }
  }

  return issues;
}
