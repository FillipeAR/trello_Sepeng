"use client";

import { useActionState, useRef } from "react";
import {
  createActionAction,
  createFieldAction,
  deleteActionAction,
  deleteFieldAction,
  deleteStageAction,
  moveActionAction,
  moveFieldAction,
  moveStageAction,
  updateActionAction,
  updateFieldAction,
  updateStageAction,
  type ActionState,
} from "../../actions";
import { ActionFieldSet, ErrorBanner, FieldFieldSet, StageFieldSet } from "./FormPieces";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

const initial: ActionState = {};

interface StageFieldData {
  id: string;
  label: string;
  type: string;
  required: boolean;
  helpText: string | null;
  options: unknown;
}

interface StageActionData {
  id: string;
  label: string;
  kind: string;
  targetStageId: string | null;
  requiredPermission: string | null;
  requiresComment: boolean;
  variant: string;
}

export interface StageData {
  id: string;
  key: string;
  name: string;
  displayStatus: string;
  description: string | null;
  departmentId: string | null;
  slaHours: number | null;
  mode: string;
  joinPolicy: string;
  isInitial: boolean;
  isFinal: boolean;
  color: string;
  fields: StageFieldData[];
  actions: StageActionData[];
}

function optionsToRaw(options: unknown): string {
  if (!Array.isArray(options)) return "";
  return options
    .map((o) => {
      if (o && typeof o === "object" && "value" in o) {
        const value = String((o as { value: unknown }).value);
        const label = "label" in o ? String((o as { label: unknown }).label) : value;
        return `${value}:${label}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function StageCard({
  versionId,
  stage,
  index,
  isFirst,
  isLast,
  departments,
  stageOptions,
  permissionOptions,
}: {
  versionId: string;
  stage: StageData;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  departments: { id: string; name: string }[];
  stageOptions: { id: string; name: string }[];
  permissionOptions: { key: string; description: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateStageAction, initial);
  const [moveState, moveFormAction] = useActionState(moveStageAction, initial);
  const [deleteState, deleteFormAction] = useActionState(deleteStageAction, initial);

  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: `${stage.color}1a`, color: stage.color }}
          >
            {index + 1}
          </span>
          <span className="font-medium">{stage.name}</span>
          <span className="font-mono text-xs text-muted">{stage.key}</span>
        </div>

        <div className="flex items-center gap-2">
          <form action={moveFormAction}>
            <input type="hidden" name="versionId" value={versionId} />
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" disabled={isFirst} className="btn-ghost px-2 py-1 text-xs">
              Subir
            </button>
          </form>
          <form action={moveFormAction}>
            <input type="hidden" name="versionId" value={versionId} />
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" disabled={isLast} className="btn-ghost px-2 py-1 text-xs">
              Descer
            </button>
          </form>
          <form action={deleteFormAction}>
            <input type="hidden" name="versionId" value={versionId} />
            <input type="hidden" name="stageId" value={stage.id} />
            <ConfirmSubmitButton
              confirmMessage={`Remover a etapa "${stage.name}"? Isso também remove seus campos e ações.`}
              className="btn-danger px-2 py-1 text-xs"
            >
              Excluir etapa
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <ErrorBanner errors={[...(moveState.errors ?? []), ...(deleteState.errors ?? [])]} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="stageId" value={stage.id} />
        <ErrorBanner errors={state.errors} />
        <StageFieldSet departments={departments} fieldErrors={state.fieldErrors} defaults={stage} />
        <button type="submit" disabled={pending} className="btn-ghost">
          {pending ? "Salvando…" : "Salvar etapa"}
        </button>
      </form>

      <FieldsSection versionId={versionId} stage={stage} />
      <ActionsSection
        versionId={versionId}
        stageId={stage.id}
        actions={stage.actions}
        stageOptions={stageOptions}
        permissionOptions={permissionOptions}
      />
    </div>
  );
}

// --- Campos --------------------------------------------------------------------

function FieldsSection({ versionId, stage }: { versionId: string; stage: StageData }) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Campos ({stage.fields.length})
      </h3>
      <div className="space-y-2">
        {stage.fields.map((field, i) => (
          <FieldRow
            key={field.id}
            versionId={versionId}
            field={field}
            isFirst={i === 0}
            isLast={i === stage.fields.length - 1}
          />
        ))}
      </div>
      <NewFieldForm versionId={versionId} stageId={stage.id} />
    </div>
  );
}

function FieldRow({
  versionId,
  field,
  isFirst,
  isLast,
}: {
  versionId: string;
  field: StageFieldData;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFieldAction, initial);
  const [moveState, moveFormAction] = useActionState(moveFieldAction, initial);
  const [deleteState, deleteFormAction] = useActionState(deleteFieldAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="fieldId" value={field.id} />
        <FieldFieldSet
          fieldErrors={state.fieldErrors}
          defaults={{
            label: field.label,
            type: field.type,
            required: field.required,
            helpText: field.helpText,
            optionsRaw: optionsToRaw(field.options),
          }}
        />
        <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </form>
      <ErrorBanner errors={state.errors} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={moveFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" disabled={isFirst} className="btn-ghost px-2 py-0.5 text-xs">
            Subir
          </button>
        </form>
        <form action={moveFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" disabled={isLast} className="btn-ghost px-2 py-0.5 text-xs">
            Descer
          </button>
        </form>
        <form action={deleteFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="fieldId" value={field.id} />
          <ConfirmSubmitButton
            confirmMessage={`Remover o campo "${field.label}"?`}
            className="btn-danger px-2 py-0.5 text-xs"
          >
            Excluir
          </ConfirmSubmitButton>
        </form>
        <ErrorBanner errors={[...(moveState.errors ?? []), ...(deleteState.errors ?? [])]} />
      </div>
    </div>
  );
}

function NewFieldForm({ versionId, stageId }: { versionId: string; stageId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createFieldAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-start gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="stageId" value={stageId} />
      <FieldFieldSet fieldErrors={state.fieldErrors} />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar campo"}
      </button>
      <ErrorBanner errors={state.errors} />
    </form>
  );
}

// --- Ações ---------------------------------------------------------------------

function ActionsSection({
  versionId,
  stageId,
  actions,
  stageOptions,
  permissionOptions,
}: {
  versionId: string;
  stageId: string;
  actions: StageActionData[];
  stageOptions: { id: string; name: string }[];
  permissionOptions: { key: string; description: string }[];
}) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Ações ({actions.length})</h3>
      <div className="space-y-2">
        {actions.map((action, i) => (
          <ActionRow
            key={action.id}
            versionId={versionId}
            action={action}
            stageOptions={stageOptions}
            permissionOptions={permissionOptions}
            isFirst={i === 0}
            isLast={i === actions.length - 1}
          />
        ))}
      </div>
      <NewActionForm
        versionId={versionId}
        stageId={stageId}
        stageOptions={stageOptions}
        permissionOptions={permissionOptions}
      />
    </div>
  );
}

function ActionRow({
  versionId,
  action,
  stageOptions,
  permissionOptions,
  isFirst,
  isLast,
}: {
  versionId: string;
  action: StageActionData;
  stageOptions: { id: string; name: string }[];
  permissionOptions: { key: string; description: string }[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateActionAction, initial);
  const [moveState, moveFormAction] = useActionState(moveActionAction, initial);
  const [deleteState, deleteFormAction] = useActionState(deleteActionAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="actionId" value={action.id} />
        <ActionFieldSet stageOptions={stageOptions} permissionOptions={permissionOptions} defaults={action} />
        <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </form>
      <ErrorBanner errors={state.errors} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={moveFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" disabled={isFirst} className="btn-ghost px-2 py-0.5 text-xs">
            Subir
          </button>
        </form>
        <form action={moveFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" disabled={isLast} className="btn-ghost px-2 py-0.5 text-xs">
            Descer
          </button>
        </form>
        <form action={deleteFormAction}>
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="actionId" value={action.id} />
          <ConfirmSubmitButton
            confirmMessage={`Remover a ação "${action.label}"?`}
            className="btn-danger px-2 py-0.5 text-xs"
          >
            Excluir
          </ConfirmSubmitButton>
        </form>
        <ErrorBanner errors={[...(moveState.errors ?? []), ...(deleteState.errors ?? [])]} />
      </div>
    </div>
  );
}

function NewActionForm({
  versionId,
  stageId,
  stageOptions,
  permissionOptions,
}: {
  versionId: string;
  stageId: string;
  stageOptions: { id: string; name: string }[];
  permissionOptions: { key: string; description: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createActionAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-start gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="stageId" value={stageId} />
      <ActionFieldSet stageOptions={stageOptions} permissionOptions={permissionOptions} />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar ação"}
      </button>
      <ErrorBanner errors={state.errors} />
    </form>
  );
}
