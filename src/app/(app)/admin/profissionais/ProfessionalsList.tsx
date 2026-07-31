"use client";

import { useActionState, useRef } from "react";
import {
  createProfessionalAction,
  deleteProfessionalAction,
  updateProfessionalAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export interface ProfessionalData {
  id: string;
  name: string;
  role: string;
  phone: string | null;
}

function ProfessionalRow({ professional }: { professional: ProfessionalData }) {
  const [state, formAction, pending] = useActionState(updateProfessionalAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteProfessionalAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[2fr_2fr_1.2fr_auto]">
        <input type="hidden" name="professionalId" value={professional.id} />
        <input name="name" required defaultValue={professional.name} placeholder="Nome" className="input" />
        <input
          name="role"
          required
          defaultValue={professional.role}
          placeholder='Função (ex.: "Engenheiro civil")'
          className="input"
        />
        <input name="phone" defaultValue={professional.phone ?? ""} placeholder="Telefone (opcional)" className="input" />
        <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        {state.errors?.length || deleteState.errors?.length ? (
          <p className="text-xs text-danger">
            {[...(state.errors ?? []), ...(deleteState.errors ?? [])].join(" ")}
          </p>
        ) : (
          <span />
        )}
        <form action={deleteAction}>
          <input type="hidden" name="professionalId" value={professional.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Remover "${professional.name}" do cadastro?`)) e.preventDefault();
            }}
            className="text-xs text-muted hover:text-danger"
          >
            Excluir
          </button>
        </form>
      </div>
    </div>
  );
}

function NewProfessionalForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createProfessionalAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[2fr_2fr_1.2fr_auto]"
    >
      <input name="name" required placeholder="Nome" className="input" />
      <input name="role" required placeholder='Função (ex.: "Encarregado de obra")' className="input" />
      <input name="phone" placeholder="Telefone (opcional)" className="input" />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar"}
      </button>
      {state.errors?.length ? (
        <p className="text-xs text-danger sm:col-span-4">{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}

export function ProfessionalsList({ professionals }: { professionals: ProfessionalData[] }) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Profissionais ({professionals.length})
      </h2>

      {professionals.length === 0 ? (
        <p className="text-sm text-muted">Nenhum profissional cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {professionals.map((p) => (
            <ProfessionalRow key={p.id} professional={p} />
          ))}
        </div>
      )}

      <NewProfessionalForm />
    </div>
  );
}
