import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Building2,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  HardHat,
  LayoutGrid,
  Network,
  Newspaper,
  Plus,
  Search,
  Truck,
  Users,
  Workflow,
} from "lucide-react";
import { requireActor } from "@/server/actor";
import { signOut } from "@/server/auth";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { getUnreadNotifications } from "@/modules/dashboard/queries";
import { NavLink } from "./NavLink";
import { PageTitle } from "./PageTitle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  const notifications = await getUnreadNotifications(actor);

  const navSections = [
    {
      title: "Principal",
      items: [
        { href: "/jornal", label: "Jornal Sepeng", icon: <Newspaper strokeWidth={1.75} />, show: true },
        { href: "/dashboard", label: "Painel", icon: <LayoutGrid strokeWidth={1.75} />, show: true },
        { href: "/obras", label: "Obras", icon: <Building2 strokeWidth={1.75} />, show: true },
        {
          href: "/minhas-tarefas",
          label: "Minhas tarefas",
          icon: <CheckSquare strokeWidth={1.75} />,
          show: Boolean(actor.departmentId),
        },
        { href: "/lembretes", label: "Lembretes", icon: <ClipboardList strokeWidth={1.75} />, show: true },
      ],
    },
    {
      title: "Configurações",
      items: [
        {
          href: "/admin/fluxos",
          label: "Fluxos",
          icon: <Workflow strokeWidth={1.75} />,
          show: actor.permissions.includes(PERMISSIONS.WORKFLOW_READ),
        },
        {
          href: "/admin/profissionais",
          label: "Engenheiros",
          icon: <HardHat strokeWidth={1.75} />,
          show: actor.permissions.includes(PERMISSIONS.STAFF_MANAGE),
        },
        {
          href: "/admin/organograma",
          label: "Organograma",
          icon: <Network strokeWidth={1.75} />,
          show: actor.permissions.includes(PERMISSIONS.STAFF_MANAGE),
        },
        {
          href: "/admin/fornecedores",
          label: "Fornecedores",
          icon: <Truck strokeWidth={1.75} />,
          show: actor.permissions.includes(PERMISSIONS.PROCUREMENT_MANAGE),
        },
        {
          href: "/admin/usuarios",
          label: "Usuários",
          icon: <Users strokeWidth={1.75} />,
          show: actor.permissions.includes(PERMISSIONS.USER_MANAGE),
        },
      ],
    },
  ]
    .map((section) => ({ ...section, items: section.items.filter((item) => item.show) }))
    .filter((section) => section.items.length > 0);

  const allNavItems = navSections.flatMap((section) => section.items);
  const canCreateProject = actor.permissions.includes(PERMISSIONS.PROJECT_CREATE);
  const initials =
    actor.userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  async function logout() {
    "use server";
    await signOut({ redirect: false });
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside
        className="flex flex-col gap-1 px-3 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-[260px] lg:shrink-0"
        style={{
          background: "linear-gradient(180deg, var(--sidebar-from), var(--sidebar-via), var(--sidebar-to))",
        }}
      >
        <div className="flex items-center gap-2.5 px-2 pb-5 pt-1">
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(135deg, #6366F1, #4F46E5)" }}
          >
            <Workflow className="h-[18px] w-[18px] text-white" strokeWidth={2} />
          </div>
          <span className="text-[19px] font-extrabold tracking-tight text-white">ObraFlow</span>
        </div>

        {/* Mobile: nav plana, rolagem horizontal */}
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:hidden">
          {allNavItems.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop: nav agrupada por seção */}
        <nav className="hidden flex-1 flex-col gap-5 overflow-y-auto px-1 lg:flex">
          {navSections.map((section) => (
            <div key={section.title}>
              <div className="px-2.5 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5B6B8C]">
                {section.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} href={item.href} icon={item.icon}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <details className="group mt-2 hidden border-t border-white/10 px-2 pt-3.5 lg:block">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg py-1 outline-none [&::-webkit-details-marker]:hidden">
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #818CF8, #4F46E5)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-white">{actor.userName}</div>
              <div className="text-xs text-[#8B9AC0]">{actor.roleName}</div>
            </div>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[#8B9AC0] transition group-open:rotate-180" />
          </summary>
          <form action={logout} className="mt-1.5">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#CBD5E1] hover:bg-white/5"
            >
              Sair
            </button>
          </form>
        </details>

        <form action={logout} className="lg:hidden">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#CBD5E1] hover:bg-white/5"
          >
            Sair
          </button>
        </form>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-5 border-b border-border bg-surface px-5 py-3.5 lg:px-8">
          <PageTitle />

          <div className="hidden max-w-[480px] flex-1 items-center gap-2.5 rounded-[10px] bg-surface-muted px-3.5 py-2.5 sm:flex">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted" strokeWidth={1.75} />
            <span className="flex-1 truncate text-sm text-muted">Buscar obras, tarefas ou pessoas…</span>
            <kbd className="rounded-md bg-border px-1.5 py-0.5 text-xs font-semibold text-muted">⌘K</kbd>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/notificacoes"
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-muted transition hover:bg-surface-muted"
            >
              <Bell className="h-[19px] w-[19px]" strokeWidth={1.75} />
              {notifications.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              ) : null}
            </Link>
            <div className="hidden text-right lg:block">
              <div className="text-xs font-medium">{actor.userName}</div>
              <div className="text-[11px] text-muted">{actor.roleName}</div>
            </div>
            {canCreateProject ? (
              <Link href="/obras/criar" className="btn-primary ml-1 text-sm">
                <Plus className="h-[15px] w-[15px]" strokeWidth={2.5} />
                <span className="hidden sm:inline">Nova Obra</span>
              </Link>
            ) : null}
            <form action={logout} className="hidden lg:block">
              <button type="submit" className="btn-ghost text-xs">
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 bg-background p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
