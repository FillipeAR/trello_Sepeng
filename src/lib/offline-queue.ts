/**
 * Fila de escrita local pro registro de progresso em campo (Fase 3 —
 * ver ProgressUpdateForm). Roda só no navegador. Não depende da Background
 * Sync API (sem suporte no Safari/iOS, comum em obra) — sincroniza via
 * evento `online` e ao montar o formulário, o que cobre "internet instável"
 * sem exigir um navegador específico.
 *
 * Guarda no IndexedDB (não localStorage) porque a foto é um `File`, que
 * localStorage não serializa.
 */

export interface QueuedUpdate {
  id: string;
  projectId: string;
  type: "PROGRESS" | "INCIDENT" | "NOTE";
  description: string;
  progressPercent: number | null;
  photo: File | null;
  createdAt: number;
}

const DB_NAME = "obraflow-offline";
const DB_VERSION = 1;
const STORE = "pending-updates";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueUpdate(entry: QueuedUpdate): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedUpdates(): Promise<QueuedUpdate[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedUpdate[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedUpdate(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toFormData(entry: QueuedUpdate): FormData {
  const fd = new FormData();
  fd.set("projectId", entry.projectId);
  fd.set("type", entry.type);
  fd.set("description", entry.description);
  if (entry.progressPercent !== null) fd.set("progressPercent", String(entry.progressPercent));
  if (entry.photo) fd.set("photo", entry.photo, entry.photo.name);
  return fd;
}

/**
 * Tenta enviar na hora; se a rede falhar (ou já estiver offline), guarda na
 * fila local e devolve `queued: true` — quem chama decide a mensagem pro
 * usuário a partir disso.
 */
export async function submitUpdate(
  entry: Omit<QueuedUpdate, "id" | "createdAt">,
): Promise<{ queued: boolean }> {
  const full: QueuedUpdate = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };

  if (navigator.onLine) {
    try {
      const res = await fetch("/api/atualizacoes", { method: "POST", body: toFormData(full) });
      if (res.ok) return { queued: false };
    } catch {
      // rede caiu apesar do navigator.onLine dizer que tava tudo bem — cai pra fila.
    }
  }

  await queueUpdate(full);
  return { queued: true };
}

/** Reenvia tudo que está na fila. Item que falha de novo continua na fila pra próxima tentativa. */
export async function syncQueuedUpdates(): Promise<{ synced: number; remaining: number }> {
  const items = await listQueuedUpdates();
  let synced = 0;

  for (const item of items) {
    try {
      const res = await fetch("/api/atualizacoes", { method: "POST", body: toFormData(item) });
      if (res.ok) {
        await removeQueuedUpdate(item.id);
        synced += 1;
      }
    } catch {
      // ainda sem rede — deixa na fila.
    }
  }

  const remaining = (await listQueuedUpdates()).length;
  return { synced, remaining };
}
