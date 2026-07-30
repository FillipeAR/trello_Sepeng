import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { signOut } from "@/server/auth";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { getUnreadNotifications } from "@/modules/dashboard/queries";
import { NavLink } from "./NavLink";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  const notifications = await getUnreadNotifications(actor);

  const nav = [
    { href: "/dashboard", label: "Painel", show: true },
    { href: "/obras", label: "Obras", show: true },
    { href: "/minhas-tarefas", label: "Minhas tarefas", show: Boolean(actor.departmentId) },
    {
      href: "/obras/cadastrar",
      label: "Nova obra",
      show: actor.permissions.includes(PERMISSIONS.PROJECT_CREATE),
    },
    {
      href: "/admin/fluxos",
      label: "Fluxos",
      show: actor.permissions.includes(PERMISSIONS.WORKFLOW_READ),
    },
  ].filter((item) => item.show);

  async function logout() {
    "use server";
    await signOut({ redirect: false });
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <div>
            <div className="text-lg font-semibold tracking-tight">ObraFlow</div>
            <div className="text-xs text-muted">{actor.organizationName}</div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-border p-4 lg:block">
          <div className="text-sm font-medium">{actor.userName}</div>
          <div className="text-xs text-muted">
            {actor.roleName}
            {actor.departmentName ? ` · ${actor.departmentName}` : ""}
          </div>
          <form action={logout} className="mt-3">
            <button type="submit" className="btn-ghost w-full text-xs">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
          <div className="text-sm text-muted">
            Acompanhamento operacional de obras em tempo real
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/notificacoes"
              className="relative rounded-lg border border-border px-3 py-1.5 text-xs"
            >
              Notificações
              {notifications.length > 0 ? (
                <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {notifications.length}
                </span>
              ) : null}
            </Link>
            <div className="hidden text-right lg:block">
              <div className="text-xs font-medium">{actor.userName}</div>
              <div className="text-[11px] text-muted">{actor.roleName}</div>
            </div>
            <form action={logout} className="lg:hidden">
              <button type="submit" className="btn-ghost text-xs">
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
