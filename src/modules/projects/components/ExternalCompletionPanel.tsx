"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AvailableAction, StageDef } from "@/core/workflow/types";
import { executeStageActionForm, type ActionState } from "@/app/(app)/obras/actions";

const initial: ActionState = {};

/**
 * Painel exibido no lugar de `DynamicStageForm` quando `stage.completionMode
 * === "EXTERNAL"` — a etapa não tem formulário próprio, quem conclui é outra
 * rota da aplicação (ex.: o canvas de Equipe da Obra). Ações que não sejam
 * de avanço (ex.: "Devolver") continuam disponíveis aqui mesmo, num
 * formulário compacto — não é só a Diretoria que usa isso, então nada aqui
 * sabe o nome da etapa nem pra onde ela redireciona além do que o dado diz.
 */
export function ExternalCompletionPanel({
  projectId,
  stage,
  actions,
}: {
  projectId: string;
  stage: StageDef;
  actions: AvailableAction[];
}) {
  const [state, formAction, pending] = useActionState(executeStageActionForm, initial);
  const secondaryActions = actions.filter((a) => a.kind !== "ADVANCE");

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold">{stage.name}</h2>
        <p className="text-xs text-muted">{stage.description}</p>
      </div>

      {stage.externalCompletionPath ? (
        <Link href={`/obras/${projectId}/${stage.externalCompletionPath}`} className="btn-primary block text-center">
          {stage.externalCompletionLabel ?? "Continuar"}
        </Link>
      ) : null}

      {secondaryActions.length > 0 ? (
        <form action={formAction} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="stageId" value={stage.id} />

          {state.errors?.length ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor={`comment-${stage.id}`}>
              Comentário
            </label>
            <textarea
              id={`comment-${stage.id}`}
              name="comment"
              rows={2}
              className="input"
              placeholder="Opcional — fica registrado no histórico"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => (
              <button
                key={action.key}
                type="submit"
                name="actionKey"
                value={action.key}
                disabled={!action.enabled || pending}
                title={action.disabledReason}
                className={action.variant === "danger" ? "btn-danger" : "btn-ghost"}
              >
                {pending ? "Processando…" : action.label}
              </button>
            ))}
          </div>
        </form>
      ) : null}
    </div>
  );
}
