"use client";

import { useActionState, useRef } from "react";
import { buildOrgChartTree, flattenWithDepth, type FlatPosition, type OrgChartTreeNode } from "@/modules/orgchart/tree";
import {
  createPositionAction,
  deletePositionAction,
  movePositionAction,
  updatePositionAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

interface ParentOption {
  id: string;
  label: string;
}

function ParentSelect({
  name,
  options,
  defaultValue,
  excludeId,
}: {
  name: string;
  options: ParentOption[];
  defaultValue: string;
  excludeId?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className="input">
      <option value="">— (cargo raiz)</option>
      {options
        .filter((o) => o.id !== excludeId)
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
    </select>
  );
}

function PositionNode({
  node,
  depth,
  parentOptions,
}: {
  node: OrgChartTreeNode;
  depth: number;
  parentOptions: ParentOption[];
}) {
  const [state, formAction, pending] = useActionState(updatePositionAction, initial);
  const [moveState, moveAction] = useActionState(movePositionAction, initial);
  const [deleteState, deleteAction] = useActionState(deletePositionAction, initial);

  return (
    <li>
      <div className="rounded-lg border border-border p-2.5" style={{ marginLeft: depth * 24 }}>
        <form action={formAction} className="grid gap-2 sm:grid-cols-[2fr_2fr_auto]">
          <input type="hidden" name="positionId" value={node.id} />
          <input name="title" required defaultValue={node.title} className="input" />
          <ParentSelect name="parentId" options={parentOptions} defaultValue={node.parentId ?? ""} excludeId={node.id} />
          <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </form>

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <form action={moveAction}>
              <input type="hidden" name="positionId" value={node.id} />
              <input type="hidden" name="direction" value="up" />
              <button type="submit" className="btn-ghost px-2 py-0.5 text-xs">
                ↑ Subir
              </button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="positionId" value={node.id} />
              <input type="hidden" name="direction" value="down" />
              <button type="submit" className="btn-ghost px-2 py-0.5 text-xs">
                ↓ Descer
              </button>
            </form>
          </div>

          {state.errors?.length || moveState.errors?.length || deleteState.errors?.length ? (
            <p className="text-xs text-danger">
              {[...(state.errors ?? []), ...(moveState.errors ?? []), ...(deleteState.errors ?? [])].join(" ")}
            </p>
          ) : null}

          <form action={deleteAction}>
            <input type="hidden" name="positionId" value={node.id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Remover "${node.title}"? Subordinados diretos sobem pro topo do organograma.`))
                  e.preventDefault();
              }}
              className="text-xs text-muted hover:text-danger"
            >
              Excluir
            </button>
          </form>
        </div>
      </div>

      {node.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <PositionNode key={child.id} node={child} depth={depth + 1} parentOptions={parentOptions} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function NewPositionForm({ parentOptions }: { parentOptions: ParentOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createPositionAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[2fr_2fr_auto]"
    >
      <input name="title" required placeholder='Cargo — ex.: "Engenheiro Residente"' className="input" />
      <ParentSelect name="parentId" options={parentOptions} defaultValue="" />
      <button type="submit" disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        {pending ? "Adicionando…" : "Adicionar"}
      </button>
      {state.errors?.length ? (
        <p className="text-xs text-danger sm:col-span-3">{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}

export function OrgChartEditor({ positions }: { positions: FlatPosition[] }) {
  const tree = buildOrgChartTree(positions);
  const parentOptions: ParentOption[] = flattenWithDepth(tree).map(({ node, depth }) => ({
    id: node.id,
    label: `${"— ".repeat(depth)}${node.title}`,
  }));

  return (
    <div className="card space-y-4 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Cargos ({positions.length})
      </h2>

      {tree.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cargo cadastrado ainda — comece adicionando os diretores.</p>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <PositionNode key={node.id} node={node} depth={0} parentOptions={parentOptions} />
          ))}
        </ul>
      )}

      <NewPositionForm parentOptions={parentOptions} />
    </div>
  );
}
