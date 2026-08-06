"use client";

import { useActionState, useState } from "react";
import type { AvailableAction, StageDef, StageFieldDef } from "@/core/workflow/types";
import { executeStageActionForm, type ActionState } from "@/app/(app)/obras/actions";

const initial: ActionState = {};

export interface UserOption {
  id: string;
  name: string;
}

export interface ProfessionalOption {
  id: string;
  name: string;
  role: string;
}

/**
 * Renderiza o formulário da etapa a partir da CONFIGURAÇÃO (`StageField`).
 * Adicionar um campo novo na etapa da Diretoria é inserir uma linha no banco —
 * este componente não precisa saber que ele existe.
 */
function Field({
  field,
  users,
  professionals,
  error,
}: {
  field: StageFieldDef;
  users: UserOption[];
  professionals: ProfessionalOption[];
  error?: string;
}) {
  const name = `field.${field.key}`;
  const common = { id: name, name, className: "input" };

  let control: React.ReactNode;

  switch (field.type) {
    case "TEXTAREA":
      control = <textarea {...common} rows={3} />;
      break;
    case "NUMBER":
      control = <input {...common} type="number" step="1" />;
      break;
    case "CURRENCY":
      control = <input {...common} type="number" step="0.01" min="0" />;
      break;
    case "DATE":
      control = <input {...common} type="date" />;
      break;
    case "CHECKBOX":
      control = (
        <label className="flex items-center gap-2 text-sm">
          <input id={name} name={name} type="checkbox" className="h-4 w-4" />
          <span className="text-muted">Confirmo</span>
        </label>
      );
      break;
    case "SELECT":
      control = (
        <select {...common} defaultValue="">
          <option value="">Selecione…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "MULTISELECT":
      control = (
        <select {...common} multiple size={Math.min(5, field.options?.length ?? 3)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "USER":
      control = (
        <select {...common} defaultValue="">
          <option value="">Selecione…</option>
          {users.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
      );
      break;
    case "USER_MULTI":
      control = (
        <select {...common} multiple size={Math.min(6, users.length)}>
          {users.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
      );
      break;
    case "STAFF":
      control = (
        <select {...common} defaultValue="">
          <option value="">Selecione…</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.role}
            </option>
          ))}
        </select>
      );
      break;
    case "FILE":
      control = <input {...common} type="file" className="input file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium" />;
      break;
    default:
      control = <input {...common} type="text" />;
  }

  return (
    <div>
      <label className="label" htmlFor={name}>
        {field.label}
        {field.required ? <span className="ml-1 text-danger">*</span> : null}
      </label>
      {control}
      <input type="hidden" name={`type.${field.key}`} value={field.type} />
      {field.helpText ? <p className="mt-1 text-xs text-muted">{field.helpText}</p> : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function DynamicStageForm({
  projectId,
  stage,
  actions,
  users,
  professionals,
}: {
  projectId: string;
  stage: StageDef;
  actions: AvailableAction[];
  users: UserOption[];
  professionals: ProfessionalOption[];
}) {
  const [state, formAction, pending] = useActionState(executeStageActionForm, initial);
  const [actionKey, setActionKey] = useState<string>(
    actions.find((a) => a.enabled)?.key ?? "",
  );

  const selected = actions.find((a) => a.key === actionKey);
  const enabledActions = actions.filter((a) => a.enabled);

  if (enabledActions.length === 0) {
    return (
      <div className="card p-6">
        <h2 className="text-sm font-semibold">{stage.name}</h2>
        <p className="mt-2 text-sm text-muted">
          Esta etapa é responsabilidade de outro departamento. Você acompanha o andamento,
          mas não pode executar ações aqui.
        </p>
        {actions[0]?.disabledReason ? (
          <p className="mt-2 text-xs text-muted">{actions[0].disabledReason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stageId" value={stage.id} />

      <div>
        <h2 className="text-sm font-semibold">Ação nesta etapa — {stage.name}</h2>
        <p className="text-xs text-muted">{stage.description}</p>
      </div>

      {state.errors?.length ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      ) : null}

      {state.success ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Etapa concluída. A obra avançou na esteira.
        </div>
      ) : null}

      <div className="space-y-4">
        {[...stage.fields]
          .sort((a, b) => a.order - b.order)
          .map((field) => (
            <Field
              key={field.id}
              field={field}
              users={users}
              professionals={professionals}
              error={state.fieldErrors?.[field.key]}
            />
          ))}
      </div>

      <div>
        <label className="label" htmlFor="comment">
          Comentário
          {selected?.requiresComment ? <span className="ml-1 text-danger">*</span> : null}
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={2}
          className="input"
          placeholder={
            selected?.requiresComment
              ? "Justificativa obrigatória para esta ação"
              : "Opcional — fica registrado no histórico"
          }
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {actions.map((action) => (
          <button
            key={action.key}
            type="submit"
            name="actionKey"
            value={action.key}
            disabled={!action.enabled || pending}
            title={action.disabledReason}
            onClick={() => setActionKey(action.key)}
            className={
              action.variant === "danger"
                ? "btn-danger"
                : action.variant === "ghost"
                  ? "btn-ghost"
                  : "btn-primary"
            }
          >
            {pending && actionKey === action.key ? "Processando…" : action.label}
          </button>
        ))}
      </div>
    </form>
  );
}
