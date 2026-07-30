import { canActOnStage, type Actor } from "@/core/rbac/can";
import { evaluateCondition } from "./conditions";
import type {
  AvailableAction,
  EvaluationContext,
  FieldError,
  StageDef,
  StageFieldDef,
  TransitionDecision,
  WorkflowSnapshot,
} from "./types";

/**
 * Engine de workflow — o coração do sistema.
 *
 * Nenhuma etapa, departamento ou status está escrito aqui. Tudo vem do
 * `WorkflowSnapshot`, que é dado do banco. Inserir "Jurídico" entre Orçamento e
 * Diretoria é uma linha nova numa tabela, não um deploy.
 */

export function getStage(snapshot: WorkflowSnapshot, stageId: string): StageDef | undefined {
  return snapshot.stages.find((s) => s.id === stageId);
}

export function getInitialStage(snapshot: WorkflowSnapshot): StageDef {
  const initial =
    snapshot.stages.find((s) => s.isInitial) ??
    [...snapshot.stages].sort((a, b) => a.order - b.order)[0];
  if (!initial) {
    throw new Error("Fluxo inválido: nenhuma etapa inicial definida.");
  }
  return initial;
}

// --- Validação de campos ----------------------------------------------------

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function validateFieldValue(field: StageFieldDef, value: unknown): string | null {
  if (isBlank(value)) return null; // obrigatoriedade é tratada à parte

  switch (field.type) {
    case "NUMBER":
    case "CURRENCY":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : "Informe um número válido.";
    case "DATE":
      return !Number.isNaN(new Date(value as string).getTime())
        ? null
        : "Informe uma data válida.";
    case "CHECKBOX":
      return typeof value === "boolean" ? null : "Valor inválido.";
    case "SELECT": {
      const allowed = field.options?.map((o) => o.value) ?? [];
      if (allowed.length === 0) return null;
      return allowed.includes(String(value)) ? null : "Opção inválida.";
    }
    case "MULTISELECT":
    case "USER_MULTI":
      return Array.isArray(value) ? null : "Valor inválido.";
    default:
      return null;
  }
}

/** Campos obrigatórios preenchidos e valores no formato certo? */
export function validateStageFields(
  stage: StageDef,
  values: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  for (const field of stage.fields) {
    const value = values[field.key];

    if (field.required && isBlank(value)) {
      errors.push({ fieldKey: field.key, message: `"${field.label}" é obrigatório.` });
      continue;
    }

    const message = validateFieldValue(field, value);
    if (message) errors.push({ fieldKey: field.key, message });
  }

  return errors;
}

// --- Ações disponíveis ------------------------------------------------------

/**
 * O que este usuário pode fazer na etapa atual. Ações que ele não pode executar
 * voltam com `enabled: false` e o motivo — esconder sem explicar gera chamado
 * de suporte.
 */
export function getAvailableActions(
  snapshot: WorkflowSnapshot,
  stageId: string,
  actor: Actor,
): AvailableAction[] {
  const stage = getStage(snapshot, stageId);
  if (!stage) return [];

  return [...stage.actions]
    .sort((a, b) => a.order - b.order)
    .map((action) => {
      const check = canActOnStage(actor, {
        stageDepartmentId: stage.departmentId,
        requiredPermission: action.requiredPermission,
      });
      return {
        ...action,
        enabled: check.allowed,
        disabledReason: check.reason,
      };
    });
}

// --- Resolução da transição -------------------------------------------------

/**
 * Para onde a obra vai. Ordem de precedência:
 * 1. transição explícita cuja condição é satisfeita;
 * 2. `targetStageId` declarado na própria ação;
 * 3. próxima etapa por `order` (o caminho feliz do fluxo linear).
 */
export function resolveTargetStage(
  snapshot: WorkflowSnapshot,
  currentStage: StageDef,
  actionId: string,
  ctx: EvaluationContext,
): StageDef | null {
  const candidates = snapshot.transitions
    .filter((t) => t.fromStageId === currentStage.id)
    .filter((t) => t.actionId === null || t.actionId === actionId)
    .sort((a, b) => a.order - b.order);

  for (const transition of candidates) {
    if (evaluateCondition(transition.condition, ctx)) {
      return getStage(snapshot, transition.toStageId) ?? null;
    }
  }

  const action = currentStage.actions.find((a) => a.id === actionId);
  if (action?.targetStageId) {
    return getStage(snapshot, action.targetStageId) ?? null;
  }

  if (currentStage.isFinal) return null;

  const next = [...snapshot.stages]
    .filter((s) => s.order > currentStage.order)
    .sort((a, b) => a.order - b.order)[0];

  return next ?? null;
}

export interface TransitionRequest {
  snapshot: WorkflowSnapshot;
  currentStageId: string;
  actionKey: string;
  actor: Actor;
  fieldValues: Record<string, unknown>;
  comment?: string | null;
  projectContext?: Record<string, unknown>;
}

/**
 * A decisão completa: pode transicionar? Se não, por quê? Se sim, para onde?
 * Esta função é a única autoridade — a UI apenas reflete o que ela diz.
 */
export function canTransition(req: TransitionRequest): TransitionDecision {
  const errors: string[] = [];
  const stage = getStage(req.snapshot, req.currentStageId);

  if (!stage) {
    return {
      allowed: false,
      errors: ["Etapa atual não encontrada nesta versão do fluxo."],
      fieldErrors: [],
    };
  }

  const action = stage.actions.find((a) => a.key === req.actionKey);
  if (!action) {
    return {
      allowed: false,
      errors: [`Ação "${req.actionKey}" não existe na etapa "${stage.name}".`],
      fieldErrors: [],
    };
  }

  const permission = canActOnStage(req.actor, {
    stageDepartmentId: stage.departmentId,
    requiredPermission: action.requiredPermission,
  });
  if (!permission.allowed && permission.reason) {
    errors.push(permission.reason);
  }

  if (action.requiresComment && isBlank(req.comment)) {
    errors.push("Esta ação exige uma justificativa.");
  }

  // Devolver ou reprovar não exige o preenchimento completo da etapa.
  const fieldErrors =
    action.kind === "ADVANCE" || action.kind === "FINISH"
      ? validateStageFields(stage, req.fieldValues)
      : [];

  if (fieldErrors.length > 0) {
    errors.push("Há campos obrigatórios pendentes nesta etapa.");
  }

  const ctx: EvaluationContext = {
    field: req.fieldValues,
    project: req.projectContext ?? {},
    actor: { userId: req.actor.userId, departmentId: req.actor.departmentId },
  };

  const targetStage =
    action.kind === "FINISH"
      ? null
      : resolveTargetStage(req.snapshot, stage, action.id, ctx);

  if (action.kind !== "FINISH" && !targetStage) {
    errors.push("Nenhuma etapa de destino aplicável para esta ação.");
  }

  return {
    allowed: errors.length === 0,
    errors,
    fieldErrors,
    action,
    targetStage,
  };
}

// --- Apoio à UI -------------------------------------------------------------

export function computeDueDate(stage: StageDef, enteredAt: Date): Date | null {
  if (!stage.slaHours) return null;
  return new Date(enteredAt.getTime() + stage.slaHours * 60 * 60 * 1000);
}

export function isSlaBreached(dueAt: Date | null, now: Date = new Date()): boolean {
  return dueAt !== null && now.getTime() > dueAt.getTime();
}

/** Percentual do fluxo já percorrido — alimenta a barra estilo iFood. */
export function workflowProgress(
  snapshot: WorkflowSnapshot,
  currentStageId: string | null,
): number {
  const ordered = [...snapshot.stages].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return 0;
  if (!currentStageId) return 100;

  const index = ordered.findIndex((s) => s.id === currentStageId);
  if (index === -1) return 0;
  return Math.round((index / (ordered.length - 1 || 1)) * 100);
}
