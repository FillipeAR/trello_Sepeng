"use client";

import { useMemo, useState } from "react";
import { flattenWithDepth, type TeamPositionTreeNode } from "../tree";
import type { TeamOccupant } from "../queries";

export function TeamListView({
  tree,
  occupantByPositionId,
}: {
  tree: TeamPositionTreeNode[];
  occupantByPositionId: Record<string, TeamOccupant | null>;
}) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const flat = flattenWithDepth(tree);
    const byId = new Map(flat.map(({ node }) => [node.id, node]));
    return flat
      .map(({ node, depth }) => ({
        node,
        depth,
        occupant: occupantByPositionId[node.id] ?? null,
        parentTitle: node.parentId ? (byId.get(node.parentId)?.title ?? "—") : "—",
      }))
      .filter(({ node, occupant }) => {
        if (!search.trim()) return true;
        const haystack = `${node.title} ${occupant?.name ?? ""} ${occupant?.role ?? ""}`.toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
      });
  }, [tree, occupantByPositionId, search]);

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por cargo ou pessoa…"
        className="input mb-3 max-w-sm text-sm"
      />
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Pessoa</th>
              <th className="px-3 py-2 font-medium">Função</th>
              <th className="px-3 py-2 font-medium">Setor</th>
              <th className="px-3 py-2 font-medium">Superior</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth, occupant, parentTitle }) => (
              <tr key={node.id} className="border-t border-border">
                <td className="px-3 py-2">{occupant?.name ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 14}px` }}>
                  {node.title}
                </td>
                <td className="px-3 py-2 text-muted">{node.sector ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{parentTitle}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs ${occupant ? "text-success" : "text-muted"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${occupant ? "bg-success" : "bg-muted"}`} />
                    {occupant ? "Ocupado" : "Vago"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Nenhum cargo encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
