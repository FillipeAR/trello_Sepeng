"use client";

import { useActionState, useRef } from "react";
import {
  createUserAction,
  setUserActiveAction,
  updateUserAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export interface UserData {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  departmentId: string | null;
  departmentName: string | null;
}

export interface OptionData {
  id: string;
  name: string;
}

function UserRow({
  user,
  roles,
  departments,
  isSelf,
}: {
  user: UserData;
  roles: OptionData[];
  departments: OptionData[];
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateUserAction, initial);
  const [toggleState, toggleAction, togglePending] = useActionState(setUserActiveAction, initial);

  return (
    <div className="rounded-lg border border-border p-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1.6fr_1.4fr_1.2fr_1.4fr_auto]">
        <input type="hidden" name="userId" value={user.id} />
        <input name="name" required defaultValue={user.name} placeholder="Nome" className="input" />
        <select name="roleId" required defaultValue={user.roleId} className="input">
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="departmentId" defaultValue={user.departmentId ?? ""} className="input">
          <option value="">Sem departamento</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input name="password" type="password" placeholder="Nova senha (opcional)" className="input" />
        <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-xs text-muted">
          {user.email} · {user.isActive ? "Ativo" : "Desativado"}
        </div>
        {state.errors?.length || toggleState.errors?.length ? (
          <p className="text-xs text-danger">
            {[...(state.errors ?? []), ...(toggleState.errors ?? [])].join(" ")}
          </p>
        ) : null}
        <form action={toggleAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="isActive" value={(!user.isActive).toString()} />
          <button
            type="submit"
            disabled={togglePending || (isSelf && user.isActive)}
            title={isSelf && user.isActive ? "Você não pode desativar a própria conta." : undefined}
            className={`text-xs ${user.isActive ? "text-muted hover:text-danger" : "text-muted hover:text-primary"}`}
          >
            {user.isActive ? "Desativar" : "Reativar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function NewUserForm({ roles, departments }: { roles: OptionData[]; departments: OptionData[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createUserAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[1.6fr_1.6fr_1.2fr_1.2fr_1.2fr_auto]"
    >
      <input name="name" required placeholder="Nome" className="input" />
      <input name="email" type="email" required placeholder="E-mail" className="input" />
      <select name="roleId" required defaultValue="" className="input">
        <option value="" disabled>
          Papel
        </option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <select name="departmentId" defaultValue="" className="input">
        <option value="">Sem departamento</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <input name="password" type="password" required placeholder="Senha (mín. 8)" className="input" />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Criando…" : "Criar"}
      </button>
      {state.errors?.length ? (
        <p className="text-xs text-danger sm:col-span-6">{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}

export function UsersList({
  users,
  roles,
  departments,
  currentUserId,
}: {
  users: UserData[];
  roles: OptionData[];
  departments: OptionData[];
  currentUserId: string;
}) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Usuários ({users.length})
      </h2>

      {users.length === 0 ? (
        <p className="text-sm text-muted">Nenhum usuário cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow key={u.id} user={u} roles={roles} departments={departments} isSelf={u.id === currentUserId} />
          ))}
        </div>
      )}

      <NewUserForm roles={roles} departments={departments} />
    </div>
  );
}
