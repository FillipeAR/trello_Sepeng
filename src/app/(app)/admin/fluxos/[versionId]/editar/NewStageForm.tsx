"use client";

import { useActionState, useRef } from "react";
import { createStageAction, type ActionState } from "../../actions";
import { ErrorBanner, StageFieldSet } from "./FormPieces";

const initial: ActionState = {};

export function NewStageForm({
  versionId,
  departments,
}: {
  versionId: string;
  departments: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (_prev: ActionState, formData: FormData) => {
    const result = await createStageAction(_prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-5">
      <h2 className="text-sm font-semibold">Adicionar etapa</h2>
      <input type="hidden" name="versionId" value={versionId} />
      <ErrorBanner errors={state.errors} />
      <StageFieldSet departments={departments} fieldErrors={state.fieldErrors} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Adicionando…" : "Adicionar etapa"}
      </button>
    </form>
  );
}
