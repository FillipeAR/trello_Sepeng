import type { Actor } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { StageActionDef, StageDef, StageFieldDef, TransitionDef, WorkflowSnapshot } from "./types";

/** Fábricas usadas pelos testes do engine. Nada aqui toca o banco. */

export function makeField(over: Partial<StageFieldDef> = {}): StageFieldDef {
  return {
    id: over.key ?? "field-1",
    key: "campo",
    label: "Campo",
    type: "TEXT",
    required: false,
    order: 0,
    options: null,
    ...over,
  };
}

export function makeAction(over: Partial<StageActionDef> = {}): StageActionDef {
  return {
    id: over.key ?? "action-1",
    key: "avancar",
    label: "Avançar",
    kind: "ADVANCE",
    targetStageId: null,
    requiredPermission: PERMISSIONS.STAGE_COMPLETE,
    requiresComment: false,
    order: 0,
    variant: "primary",
    ...over,
  };
}

export function makeStage(over: Partial<StageDef> = {}): StageDef {
  return {
    id: over.key ?? "stage-1",
    key: "etapa",
    name: "Etapa",
    displayStatus: "Em Etapa",
    order: 0,
    departmentId: null,
    slaHours: null,
    mode: "SEQUENTIAL",
    joinPolicy: "ALL",
    isInitial: false,
    isFinal: false,
    color: "#000000",
    fields: [],
    actions: [makeAction()],
    ...over,
  };
}

export function makeActor(over: Partial<Actor> = {}): Actor {
  return {
    userId: "user-1",
    organizationId: "org-1",
    roleSlug: "orcamento",
    departmentId: null,
    permissions: [PERMISSIONS.STAGE_COMPLETE],
    ...over,
  };
}

/** Fluxo linear de três etapas com departamentos distintos. */
export function makeLinearSnapshot(): WorkflowSnapshot {
  return {
    versionId: "v1",
    version: 1,
    stages: [
      makeStage({
        id: "s-orcamento",
        key: "orcamento",
        name: "Orçamento",
        displayStatus: "Obra Ganha",
        order: 0,
        isInitial: true,
        departmentId: "dep-orcamento",
        actions: [makeAction({ id: "a-orc-next", key: "avancar" })],
      }),
      makeStage({
        id: "s-diretoria",
        key: "diretoria",
        name: "Diretoria",
        displayStatus: "Planejamento Aprovado",
        order: 1,
        departmentId: "dep-diretoria",
        slaHours: 48,
        fields: [
          makeField({ id: "f-gerente", key: "gerente", label: "Gerente", type: "USER", required: true }),
          makeField({ id: "f-qtd", key: "quantidade", label: "Funcionários", type: "NUMBER", required: false }),
        ],
        actions: [
          makeAction({ id: "a-dir-next", key: "avancar" }),
          makeAction({
            id: "a-dir-back",
            key: "devolver",
            label: "Devolver ao Orçamento",
            kind: "RETURN",
            targetStageId: "s-orcamento",
            requiredPermission: PERMISSIONS.STAGE_ROLLBACK,
            requiresComment: true,
            order: 1,
          }),
        ],
      }),
      makeStage({
        id: "s-rh",
        key: "rh",
        name: "RH",
        displayStatus: "RH Concluído",
        order: 2,
        departmentId: "dep-rh",
        isFinal: true,
        actions: [makeAction({ id: "a-rh-finish", key: "finalizar", kind: "FINISH" })],
      }),
    ],
    transitions: [],
  };
}

/**
 * Fluxo com bifurcação: Diretoria (PARALLEL) abre RH e Segurança ao mesmo
 * tempo; os dois convergem em Financeiro (joinPolicy configurável por teste).
 */
export function makeParallelSnapshot(joinPolicy: "ALL" | "ANY" = "ALL"): WorkflowSnapshot {
  const transitions: TransitionDef[] = [
    {
      id: "t-dir-rh",
      fromStageId: "s-diretoria",
      toStageId: "s-rh",
      actionId: "a-dir-next",
      condition: null,
      order: 0,
    },
    {
      id: "t-dir-seguranca",
      fromStageId: "s-diretoria",
      toStageId: "s-seguranca",
      actionId: "a-dir-next",
      condition: null,
      order: 1,
    },
  ];

  return {
    versionId: "v-parallel",
    version: 1,
    stages: [
      makeStage({
        id: "s-orcamento",
        key: "orcamento",
        name: "Orçamento",
        displayStatus: "Obra Ganha",
        order: 0,
        isInitial: true,
        departmentId: "dep-orcamento",
        actions: [makeAction({ id: "a-orc-next", key: "avancar", targetStageId: "s-diretoria" })],
      }),
      makeStage({
        id: "s-diretoria",
        key: "diretoria",
        name: "Diretoria",
        displayStatus: "Planejamento Aprovado",
        order: 1,
        departmentId: "dep-diretoria",
        mode: "PARALLEL",
        actions: [makeAction({ id: "a-dir-next", key: "avancar" })],
      }),
      makeStage({
        id: "s-rh",
        key: "rh",
        name: "RH",
        displayStatus: "RH Concluído",
        order: 2,
        departmentId: "dep-rh",
        actions: [makeAction({ id: "a-rh-next", key: "avancar", targetStageId: "s-financeiro" })],
      }),
      makeStage({
        id: "s-seguranca",
        key: "seguranca",
        name: "Segurança",
        displayStatus: "Segurança Liberada",
        order: 2,
        departmentId: "dep-seguranca",
        actions: [makeAction({ id: "a-seg-next", key: "avancar", targetStageId: "s-financeiro" })],
      }),
      makeStage({
        id: "s-financeiro",
        key: "financeiro",
        name: "Financeiro",
        displayStatus: "Financeiro Liberado",
        order: 3,
        departmentId: "dep-financeiro",
        joinPolicy,
        isFinal: true,
        actions: [makeAction({ id: "a-fin-finish", key: "finalizar", kind: "FINISH" })],
      }),
    ],
    transitions,
  };
}
