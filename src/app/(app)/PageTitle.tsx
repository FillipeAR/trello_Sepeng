"use client";

import { usePathname } from "next/navigation";

const TITLES: [string, string][] = [
  ["/dashboard", "Painel"],
  ["/obras/criar", "Nova obra"],
  ["/obras", "Obras"],
  ["/minhas-tarefas", "Minhas tarefas"],
  ["/lembretes", "Lembretes"],
  ["/admin/fluxos", "Fluxos"],
  ["/admin/profissionais", "Engenheiros"],
  ["/admin/avisos-externos", "Avisos de obra ganha"],
  ["/notificacoes", "Notificações"],
];

export function PageTitle() {
  const pathname = usePathname();
  const match = TITLES.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));

  return <div className="min-w-[100px] text-[15px] font-bold text-foreground">{match?.[1] ?? "ObraFlow"}</div>;
}
