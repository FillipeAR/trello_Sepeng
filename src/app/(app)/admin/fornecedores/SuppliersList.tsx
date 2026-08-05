"use client";

import { useActionState, useRef } from "react";
import {
  createSupplierAction,
  deleteSupplierAction,
  updateSupplierAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export interface SupplierData {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  cnpj: string | null;
  notes: string | null;
}

function SupplierRow({ supplier }: { supplier: SupplierData }) {
  const [state, formAction, pending] = useActionState(updateSupplierAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteSupplierAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1.5fr_1.2fr_1fr_1.5fr_auto]">
        <input type="hidden" name="supplierId" value={supplier.id} />
        <input name="name" required defaultValue={supplier.name} placeholder="Nome" className="input" />
        <input
          name="category"
          defaultValue={supplier.category ?? ""}
          placeholder="Especialidade (ex.: Concreto)"
          className="input"
        />
        <input name="phone" defaultValue={supplier.phone ?? ""} placeholder="Telefone" className="input" />
        <input name="email" defaultValue={supplier.email ?? ""} placeholder="E-mail" className="input" />
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
          <input type="hidden" name="supplierId" value={supplier.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Remover "${supplier.name}" do cadastro?`)) e.preventDefault();
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

function NewSupplierForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createSupplierAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[1.5fr_1.2fr_1fr_1.5fr_auto]"
    >
      <input name="name" required placeholder="Nome" className="input" />
      <input name="category" placeholder="Especialidade (ex.: Concreto)" className="input" />
      <input name="phone" placeholder="Telefone" className="input" />
      <input name="email" placeholder="E-mail" className="input" />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar"}
      </button>
      {state.errors?.length ? (
        <p className="text-xs text-danger sm:col-span-5">{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}

export function SuppliersList({ suppliers }: { suppliers: SupplierData[] }) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Fornecedores ({suppliers.length})
      </h2>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {suppliers.map((s) => (
            <SupplierRow key={s.id} supplier={s} />
          ))}
        </div>
      )}

      <NewSupplierForm />
    </div>
  );
}
