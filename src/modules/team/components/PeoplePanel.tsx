"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { TeamProfessional } from "../queries";

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials}
    </div>
  );
}

export function PeoplePanel({
  professionals,
  onAddPerson,
}: {
  professionals: TeamProfessional[];
  onAddPerson: () => void;
}) {
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");

  const areas = useMemo(
    () => Array.from(new Set(professionals.map((p) => p.area).filter((a): a is string => Boolean(a)))).sort(),
    [professionals],
  );

  const filtered = professionals.filter((p) => {
    if (area && p.area !== area) return false;
    if (!search.trim()) return true;
    return `${p.name} ${p.role}`.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Pessoas disponíveis</h2>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pessoas…"
            className="input py-1.5 pl-8 text-xs"
          />
        </div>
        <select value={area} onChange={(e) => setArea(e.target.value)} className="input mt-2 py-1.5 text-xs">
          <option value="">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="p-2 text-xs text-muted">Nenhuma pessoa encontrada.</p>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex cursor-grab items-center gap-2 rounded-lg border border-border p-2 active:cursor-grabbing"
            >
              <Avatar name={p.name} avatarUrl={p.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{p.name}</div>
                <div className="truncate text-[11px] text-muted">{p.role}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${p.allocated ? "bg-muted" : "bg-success"}`} />
                  <span className={p.allocated ? "text-muted" : "text-success"}>
                    {p.allocated ? "Alocado(a)" : "Disponível"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button type="button" onClick={onAddPerson} className="btn-ghost w-full gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          Adicionar nova pessoa
        </button>
        <p className="mt-2 text-[11px] text-muted">
          Arraste e solte uma pessoa em um cargo vazio pra atribuí-la.
        </p>
      </div>
    </aside>
  );
}
