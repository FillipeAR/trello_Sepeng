import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/actor";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function RedefinirSenhaPage({ params }: { params: Promise<{ token: string }> }) {
  if (await getActor()) redirect("/dashboard");
  const { token } = await params;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8">
            <div className="mb-1 text-xl font-semibold tracking-tight">ObraFlow</div>
            <p className="text-sm text-muted">Escolher uma senha nova.</p>
          </div>
          <ResetPasswordForm token={token} />
          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/esqueci-senha" className="text-primary hover:underline">
              Pedir um link novo
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
