import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/actor";
import { SignupForm } from "./SignupForm";

export default async function CadastroPage() {
  if (await getActor()) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8">
            <div className="mb-1 text-xl font-semibold tracking-tight">ObraFlow</div>
            <p className="text-sm text-muted">Criar conta.</p>
          </div>
          <SignupForm />
          <p className="mt-6 text-center text-sm text-muted">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
