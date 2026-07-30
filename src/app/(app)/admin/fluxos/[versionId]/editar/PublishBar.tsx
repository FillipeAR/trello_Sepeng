"use client";

import { useActionState } from "react";
import { discardDraftAction, publishVersionAction, updateVersionNotesAction, type ActionState } from "../../actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { ErrorBanner } from "./FormPieces";

const initial: ActionState = {};

export function PublishBar({
  versionId,
  version,
  notes,
  stageCount,
}: {
  versionId: string;
  version: number;
  notes: string;
  stageCount: number;
}) {
  const [notesState, notesAction, notesPending] = useActionState(updateVersionNotesAction, initial);
  const [publishState, publishAction, publishPending] = useActionState(publishVersionAction, initial);
  const [discardState, discardAction, discardPending] = useActionState(discardDraftAction, initial);

  return (
    <div className="card space-y-4 border-warning/30 bg-warning/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">Rascunho v{version}</span>
          <p className="mt-1 text-xs text-muted">
            Só é visível aqui. Publicar cria a próxima versão imutável do fluxo — obras em
            andamento continuam na versão em que entraram.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form action={discardAction}>
            <input type="hidden" name="versionId" value={versionId} />
            <ConfirmSubmitButton
              confirmMessage="Descartar este rascunho? Todas as etapas, campos e ações editados aqui serão perdidos."
              disabled={discardPending}
              className="btn-danger"
            >
              {discardPending ? "Descartando…" : "Descartar rascunho"}
            </ConfirmSubmitButton>
          </form>

          <form action={publishAction}>
            <input type="hidden" name="versionId" value={versionId} />
            <ConfirmSubmitButton
              confirmMessage={`Publicar a v${version} com ${stageCount} etapa(s)? A versão publicada é imutável.`}
              disabled={publishPending}
              className="btn-primary"
            >
              {publishPending ? "Publicando…" : "Publicar versão"}
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <ErrorBanner errors={[...(publishState.errors ?? []), ...(discardState.errors ?? [])]} />

      <form action={notesAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="versionId" value={versionId} />
        <div className="flex-1">
          <label className="label">Notas do rascunho (opcional)</label>
          <input name="notes" defaultValue={notes} className="input" placeholder="O que mudou nesta versão?" />
        </div>
        <button type="submit" disabled={notesPending} className="btn-ghost">
          {notesPending ? "Salvando…" : "Salvar notas"}
        </button>
      </form>
      <ErrorBanner errors={notesState.errors} />
    </div>
  );
}
