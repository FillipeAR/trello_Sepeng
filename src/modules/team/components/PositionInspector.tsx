"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import {
  assignProfessionalAction,
  deletePositionAction,
  updatePositionAction,
  type ActionState,
} from "@/app/(app)/obras/[id]/equipe/actions";
import { flattenWithDepth, type FlatTeamPosition, type TeamPositionTreeNode } from "../tree";
import { TEAM_POSITION_PERMISSIONS } from "../permissions-catalog";
import type { TeamOccupant } from "../queries";

const initial: ActionState = {};

export function PositionInspector({
  projectId,
  position,
  occupant,
  tree,
  onClose,
}: {
  projectId: string;
  position: FlatTeamPosition;
  occupant: TeamOccupant | null;
  tree: TeamPositionTreeNode[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(updatePositionAction, initial);
  const [unassignState, unassignAction, unassignPending] = useActionState(assignProfessionalAction, initial);
  const [deleteState, deleteAction] = useActionState(deletePositionAction, initial);

  const flat = flattenWithDepth(tree);
  const depth = flat.find((f) => f.node.id === position.id)?.depth ?? 0;
  const parentOptions = flat.filter((f) => f.node.id !== position.id);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Informações do cargo</h2>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="positionId" value={position.id} />

        <div>
          <label className="label text-xs">Cargo</label>
          <input name="title" required defaultValue={position.title} className="input text-sm" />
        </div>

        <p className="text-xs text-muted">Nível hierárquico {depth + 1}</p>

        <div>
          <label className="label text-xs">Setor</label>
          <input name="sector" defaultValue={position.sector ?? ""} placeholder="ex.: Gestão" className="input text-sm" />
        </div>

        <div>
          <label className="label text-xs">Superior</label>
          <select name="parentId" defaultValue={position.parentId ?? ""} className="input text-sm">
            <option value="">— (raiz)</option>
            {parentOptions.map(({ node, depth: d }) => (
              <option key={node.id} value={node.id}>
                {"— ".repeat(d)}
                {node.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="label text-xs">Permissões de acesso</p>
          <div className="space-y-1.5 rounded-lg border border-border p-2.5">
            {TEAM_POSITION_PERMISSIONS.map((perm) => (
              <label key={perm.key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="permissions"
                  value={perm.key}
                  defaultChecked={position.permissions.includes(perm.key)}
                  className="h-3.5 w-3.5"
                />
                {perm.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Só exibição por enquanto — não bloqueia nem libera nada no sistema.
          </p>
        </div>

        {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}

        <button type="submit" disabled={pending} className="btn-primary w-full text-xs">
          {pending ? "Salvando…" : "Salvar cargo"}
        </button>
      </form>

      <div className="mt-4 border-t border-border pt-4">
        <p className="label text-xs">Responsável atual</p>
        {occupant ? (
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{occupant.name}</div>
              <div className="flex items-center gap-1 text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ativo
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">Vago — arraste alguém pra este cargo.</p>
        )}
        {unassignState.errors?.length ? (
          <p className="mt-1 text-xs text-danger">{unassignState.errors.join(" ")}</p>
        ) : null}
        {occupant ? (
          <form action={unassignAction} className="mt-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="positionId" value={position.id} />
            <input type="hidden" name="professionalId" value="" />
            <button type="submit" disabled={unassignPending} className="btn-danger w-full text-xs">
              Remover responsável
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <form action={deleteAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="positionId" value={position.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Excluir o cargo "${position.title}"? Subordinados diretos sobem pro topo.`))
                e.preventDefault();
              else onClose();
            }}
            className="text-xs text-muted hover:text-danger"
          >
            Excluir cargo
          </button>
        </form>
        {deleteState.errors?.length ? <p className="mt-1 text-xs text-danger">{deleteState.errors.join(" ")}</p> : null}
      </div>
    </aside>
  );
}
