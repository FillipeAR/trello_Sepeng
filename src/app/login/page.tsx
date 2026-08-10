import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/actor";
import { LoginForm } from "./LoginForm";

const DEMO_ACCOUNTS = [
  { email: "orcamento@obraflow.com", role: "Orçamento" },
  { email: "diretoria@obraflow.com", role: "Diretoria" },
  { email: "rh@obraflow.com", role: "RH" },
  { email: "seguranca@obraflow.com", role: "Segurança" },
  { email: "financeiro@obraflow.com", role: "Financeiro" },
  { email: "suprimentos@obraflow.com", role: "Suprimentos" },
  { email: "gestor@obraflow.com", role: "Gestor de Obra" },
  { email: "admin@obraflow.com", role: "Administrador" },
];

export default async function LoginPage() {
  if (await getActor()) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
        <div className="card p-8">
          <div className="mb-8">
            <div className="mb-1 text-xl font-semibold tracking-tight">ObraFlow</div>
            <p className="text-sm text-muted">
              Gestão operacional de obras — acompanhe cada etapa em tempo real.
            </p>
          </div>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-muted">
            Não tem conta?{" "}
            <Link href="/cadastro" className="text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </div>

        <div className="card p-8">
          <h2 className="mb-1 text-sm font-semibold">Contas de demonstração</h2>
          <p className="mb-4 text-sm text-muted">
            Senha para todas: <code className="font-mono">obraflow123</code>
          </p>
          <ul className="space-y-2 text-sm">
            {DEMO_ACCOUNTS.map((a) => (
              <li
                key={a.email}
                className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2"
              >
                <span className="font-mono text-xs">{a.email}</span>
                <span className="text-xs text-muted">{a.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
