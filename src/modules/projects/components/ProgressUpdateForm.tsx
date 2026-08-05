"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listQueuedUpdates, submitUpdate, syncQueuedUpdates } from "@/lib/offline-queue";

const TYPE_LABEL: Record<string, string> = {
  PROGRESS: "Progresso",
  INCIDENT: "Ocorrência",
  NOTE: "Nota",
};

export function ProgressUpdateForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const items = await listQueuedUpdates();
    setPendingCount(items.length);
  }, []);

  const runSync = useCallback(async () => {
    const { synced } = await syncQueuedUpdates();
    if (synced > 0) {
      setMessage(`${synced} atualização(ões) pendente(s) sincronizada(s).`);
      router.refresh();
    }
    await refreshPendingCount();
  }, [refreshPendingCount, router]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await refreshPendingCount();
      if (cancelled) return;
      await runSync();
    })();

    window.addEventListener("online", runSync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", runSync);
    };
  }, [refreshPendingCount, runSync]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    const description = String(formData.get("description") ?? "").trim();
    if (description.length < 3) {
      setMessage("Descreva a atualização (mínimo 3 caracteres).");
      return;
    }

    const progressPercentRaw = String(formData.get("progressPercent") ?? "").trim();
    const photo = formData.get("photo");

    setPending(true);
    setMessage(null);
    try {
      const result = await submitUpdate({
        projectId,
        type: String(formData.get("type") ?? "PROGRESS") as "PROGRESS" | "INCIDENT" | "NOTE",
        description,
        progressPercent: progressPercentRaw ? Number(progressPercentRaw) : null,
        photo: photo instanceof File && photo.size > 0 ? photo : null,
      });

      if (result.queued) {
        setMessage("Sem conexão agora — salvo neste aparelho, sincroniza sozinho quando a internet voltar.");
      } else {
        setMessage("Atualização registrada.");
        router.refresh();
      }
      form.reset();
      refreshPendingCount();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Registrar atualização de campo</h2>
        {pendingCount > 0 ? (
          <button type="button" onClick={runSync} className="btn-ghost text-xs">
            {pendingCount} aguardando sincronização
          </button>
        ) : null}
      </div>
      <p className="mb-4 text-xs text-muted">
        Funciona mesmo com internet instável: se a rede falhar, fica salvo aqui no aparelho e
        sincroniza sozinho depois.
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <select name="type" defaultValue="PROGRESS" className="input">
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            name="progressPercent"
            type="number"
            min={0}
            max={100}
            placeholder="% concluído (opcional)"
            className="input"
          />
        </div>
        <textarea name="description" rows={3} required minLength={3} placeholder="O que aconteceu" className="input" />
        <input name="photo" type="file" accept="image/*" capture="environment" className="input" />
        {message ? <p className="text-xs text-muted">{message}</p> : null}
        <button type="submit" disabled={pending} className="btn-ghost text-xs">
          {pending ? "Enviando…" : "Registrar"}
        </button>
      </form>
    </section>
  );
}
