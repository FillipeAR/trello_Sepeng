"use client";

import { useActionState, useEffect } from "react";
import { createPositionAction, type ActionState } from "@/app/(app)/obras/[id]/equipe/actions";
import { flattenWithDepth, type TeamPositionTreeNode } from "../tree";
import { TEAM_POSITION_PERMISSIONS } from "../permissions-catalog";
import { Modal } from "./Modal";

const initial: ActionState = {};

export function NewPositionModal({
  projectId,
  tree,
  onClose,
}: {
  projectId: string;
  tree: TeamPositionTreeNode[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(createPositionAction, initial);
  const parentOptions = flattenWithDepth(tree);

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <Modal title="Adicionar função" onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />

        <div>
          <label className="label text-xs">Nome da função</label>
          <input name="title" required placeholder='ex.: "Engenheiro Residente"' className="input text-sm" />
        </div>

        <div>
          <label className="label text-xs">Setor</label>
          <input name="sector" placeholder="ex.: Gestão" className="input text-sm" />
        </div>

        <div>
          <label className="label text-xs">Superior</label>
          <select name="parentId" defaultValue="" className="input text-sm">
            <option value="">— (raiz)</option>
            {parentOptions.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {"— ".repeat(depth)}
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
                <input type="checkbox" name="permissions" value={perm.key} className="h-3.5 w-3.5" />
                {perm.label}
              </label>
            ))}
          </div>
        </div>

        {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}

        <button type="submit" disabled={pending} className="btn-primary w-full text-sm">
          {pending ? "Criando…" : "Criar função"}
        </button>
      </form>
    </Modal>
  );
}
