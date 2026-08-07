"use client";

import { useActionState, useEffect } from "react";
import { createTeamProfessionalAction, type ActionState } from "@/app/(app)/obras/[id]/equipe/actions";
import { Modal } from "./Modal";

const initial: ActionState = {};

export function NewPersonModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createTeamProfessionalAction, initial);

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <Modal title="Adicionar pessoa" onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />

        <div>
          <label className="label text-xs">Nome</label>
          <input name="name" required className="input text-sm" />
        </div>

        <div>
          <label className="label text-xs">Foto (opcional)</label>
          <input
            name="avatar"
            type="file"
            accept="image/*"
            className="input text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
        </div>

        <div>
          <label className="label text-xs">Cargo / função</label>
          <input name="role" required placeholder='ex.: "Engenheiro civil"' className="input text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">Empresa</label>
            <input name="company" placeholder="Sepeng" className="input text-sm" />
          </div>
          <div>
            <label className="label text-xs">Área</label>
            <input name="area" placeholder="ex.: Engenharia" className="input text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">Telefone</label>
            <input name="phone" className="input text-sm" />
          </div>
          <div>
            <label className="label text-xs">E-mail</label>
            <input name="email" type="email" className="input text-sm" />
          </div>
        </div>

        {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}

        <button type="submit" disabled={pending} className="btn-primary w-full text-sm">
          {pending ? "Adicionando…" : "Adicionar pessoa"}
        </button>
      </form>
    </Modal>
  );
}
