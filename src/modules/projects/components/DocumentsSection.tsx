"use client";

import { useActionState, useRef, useState } from "react";
import {
  createDocumentAction,
  deleteDocumentAction,
  updateDocumentAction,
  type ActionState,
} from "@/app/(app)/obras/actions";
import { formatDate } from "@/lib/format";
import type { ProjectDocumentRow } from "@/modules/documents/queries";

const initial: ActionState = {};

const STATUS_LABEL: Record<ProjectDocumentRow["status"], string> = {
  OK: "Em dia",
  EXPIRING_SOON: "Vencendo",
  EXPIRED: "Vencido",
};

const STATUS_CLASS: Record<ProjectDocumentRow["status"], string> = {
  OK: "bg-success/15 text-success",
  EXPIRING_SOON: "bg-warning/15 text-warning",
  EXPIRED: "bg-danger/15 text-danger",
};

const TYPE_SUGESTIONS = ["ART", "RRT", "Alvará de Construção", "Licença Ambiental", "Apólice de Seguro"];

function DocumentForm({
  projectId,
  document,
  onDone,
}: {
  projectId: string;
  document?: ProjectDocumentRow;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = document ? updateDocumentAction : createDocumentAction;
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) {
      formRef.current?.reset();
      onDone?.();
    }
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      {document ? <input type="hidden" name="documentId" value={document.id} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Tipo</label>
          <input
            name="type"
            list="document-type-suggestions"
            required
            defaultValue={document?.type}
            placeholder="Ex.: ART"
            className="input"
          />
          <datalist id="document-type-suggestions">
            {TYPE_SUGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Número (opcional)</label>
          <input name="referenceNumber" defaultValue={document?.referenceNumber ?? ""} className="input" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Emissão (opcional)</label>
          <input
            name="issuedAt"
            type="date"
            defaultValue={document?.issuedAt ? document.issuedAt.toISOString().slice(0, 10) : undefined}
            className="input"
          />
        </div>
        <div>
          <label className="label">Validade</label>
          <input
            name="expiresAt"
            type="date"
            required
            defaultValue={document ? document.expiresAt.toISOString().slice(0, 10) : undefined}
            className="input"
          />
        </div>
      </div>
      <textarea name="notes" rows={2} placeholder="Observações (opcional)" defaultValue={document?.notes ?? ""} className="input" />
      <div>
        <label className="label">
          {document ? "Trocar arquivo (opcional)" : "Arquivo escaneado (opcional)"}
        </label>
        <input name="file" type="file" accept="image/*,application/pdf" className="input" />
      </div>
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-ghost text-xs">
          {pending ? "Salvando…" : document ? "Salvar edição" : "Registrar documento"}
        </button>
        {document ? (
          <button type="button" onClick={onDone} className="text-xs text-muted hover:text-foreground">
            Cancelar edição
          </button>
        ) : null}
      </div>
    </form>
  );
}

function DocumentRow({ projectId, document }: { projectId: string; document: ProjectDocumentRow }) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteDocumentAction, initial);

  if (editing) {
    return (
      <li className="py-3">
        <DocumentForm projectId={projectId} document={document} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          {document.type}
          {document.referenceNumber ? <span className="text-xs text-muted">nº {document.referenceNumber}</span> : null}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[document.status]}`}>
            {STATUS_LABEL[document.status]}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {document.issuedAt ? `Emitido ${formatDate(document.issuedAt)} · ` : ""}
          Válido até {formatDate(document.expiresAt)}
        </div>
        {document.notes ? <p className="mt-1 text-xs text-muted">{document.notes}</p> : null}
        {document.file ? (
          <a
            href={`/api/anexos?url=${encodeURIComponent(document.file.url)}&projectId=${projectId}`}
            className="mt-1 inline-block text-xs text-primary hover:underline"
          >
            {document.file.name}
          </a>
        ) : null}
        <p className="mt-1 text-[11px] text-muted">Registrado por {document.createdByName}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted hover:text-foreground">
            Editar
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="documentId" value={document.id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Remover o documento "${document.type}"?`)) e.preventDefault();
              }}
              className="text-xs text-muted hover:text-danger"
            >
              Excluir
            </button>
          </form>
        </div>
        {deleteState.errors?.length ? <p className="text-xs text-danger">{deleteState.errors.join(" ")}</p> : null}
      </div>
    </li>
  );
}

export function DocumentsSection({ projectId, documents }: { projectId: string; documents: ProjectDocumentRow[] }) {
  const expiringOrExpired = documents.filter((d) => d.status !== "OK").length;

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Documentos com validade</h2>
      <p className="mb-4 text-xs text-muted">ART/RRT, alvará, licença, seguro — avisamos antes de vencer.</p>
      {expiringOrExpired > 0 ? (
        <p className="mb-4 text-xs text-warning">{expiringOrExpired} documento(s) vencendo ou vencido(s).</p>
      ) : null}

      {documents.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Nenhum documento registrado ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {documents.map((d) => (
            <DocumentRow key={d.id} projectId={projectId} document={d} />
          ))}
        </ul>
      )}

      <DocumentForm projectId={projectId} />
    </section>
  );
}
