/**
 * Formas puras do fluxo de trabalho. O engine não conhece Prisma nem Next —
 * recebe estas estruturas e devolve decisões. É o que torna possível testá-lo
 * sem banco e, mais tarde, rodá-lo em outro runtime (worker, mobile, API).
 */

export type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "CURRENCY"
  | "DATE"
  | "SELECT"
  | "MULTISELECT"
  | "USER"
  | "USER_MULTI"
  | "CHECKBOX"
  | "FILE"
  | "STAFF";

export type ActionKind = "ADVANCE" | "RETURN" | "REJECT" | "FINISH";
export type StageMode = "SEQUENTIAL" | "PARALLEL";
export type JoinPolicy = "ALL" | "ANY";
export type StageInstanceStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "RETURNED";

export interface FieldOption {
  value: string;
  label: string;
}

export interface StageFieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  helpText?: string | null;
  options?: FieldOption[] | null;
  defaultValue?: unknown;
}

export interface StageActionDef {
  id: string;
  key: string;
  label: string;
  kind: ActionKind;
  targetStageId: string | null;
  requiredPermission: string | null;
  requiresComment: boolean;
  order: number;
  variant: string;
}

export interface StageDef {
  id: string;
  key: string;
  name: string;
  /** Rótulo exibido ao usuário quando a obra está nesta etapa. */
  displayStatus: string;
  description?: string | null;
  order: number;
  departmentId: string | null;
  slaHours: number | null;
  mode: StageMode;
  joinPolicy: JoinPolicy;
  isInitial: boolean;
  isFinal: boolean;
  color: string;
  fields: StageFieldDef[];
  actions: StageActionDef[];
}

export interface TransitionDef {
  id: string;
  fromStageId: string;
  toStageId: string;
  actionId: string | null;
  condition: Condition | null;
  order: number;
}

/** Snapshot imutável de uma versão publicada do fluxo. */
export interface WorkflowSnapshot {
  versionId: string;
  version: number;
  stages: StageDef[];
  transitions: TransitionDef[];
}

// --- Condições declarativas (avaliadas sem eval) ----------------------------

export type Condition =
  | { op: "always" }
  | { op: "and"; conditions: Condition[] }
  | { op: "or"; conditions: Condition[] }
  | { op: "not"; condition: Condition }
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; path: string; value: unknown }
  | { op: "in" | "nin"; path: string; value: unknown[] }
  | { op: "isEmpty" | "isNotEmpty"; path: string };

/** Contexto de avaliação: `field.<key>`, `project.<prop>`, `actor.<prop>`. */
export interface EvaluationContext {
  field: Record<string, unknown>;
  project: Record<string, unknown>;
  actor: Record<string, unknown>;
}

// --- Resultados do engine ---------------------------------------------------

export interface FieldError {
  fieldKey: string;
  message: string;
}

export interface TransitionDecision {
  allowed: boolean;
  /** Motivos que impedem a transição — mostrados ao usuário. */
  errors: string[];
  fieldErrors: FieldError[];
  action?: StageActionDef;
  /**
   * Etapas de destino. Mais de uma quando a etapa atual bifurca (`mode:
   * "PARALLEL"`); vazio quando a ação encerra o fluxo (`kind: "FINISH"`).
   */
  targetStages: StageDef[];
}

export interface AvailableAction extends StageActionDef {
  /** Falso quando o usuário vê a ação mas não pode executá-la. */
  enabled: boolean;
  disabledReason?: string;
}
