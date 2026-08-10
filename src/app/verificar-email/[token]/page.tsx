import Link from "next/link";
import { CommandError } from "@/modules/projects/commands";
import { verifyEmail } from "@/modules/auth/commands";
import { processOutbox } from "@/modules/notifications/dispatcher";

export default async function VerificarEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let result: { ok: true } | { ok: false; message: string };
  try {
    await verifyEmail({ token });
    await processOutbox();
    result = { ok: true };
  } catch (error) {
    result = { ok: false, message: error instanceof CommandError ? error.message : "Não foi possível confirmar." };
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="card p-8 text-center">
          <div className="mb-4 text-xl font-semibold tracking-tight">ObraFlow</div>

          {result.ok ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                E-mail confirmado. Falta um administrador liberar seu acesso — você recebe aviso
                assim que puder entrar.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {result.message}
            </p>
          )}

          <Link href="/login" className="btn-ghost mt-6 inline-block text-sm">
            Ir para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
