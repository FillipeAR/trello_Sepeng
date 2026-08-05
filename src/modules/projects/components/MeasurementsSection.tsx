"use client";

import { useActionState, useRef, useState } from "react";
import {
  approveMeasurementAction,
  cancelMeasurementAction,
  createMeasurementAction,
  rejectMeasurementAction,
  updateMeasurementAction,
  type ActionState,
} from "@/app/(app)/obras/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { MeasurementRow } from "@/modules/measurements/queries";
import type { MeasurementSummary } from "@/core/measurements/summary";

const initial: ActionState = {};

const STATUS_LABEL: Record<MeasurementRow["status"], string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Reprovada",
};

const STATUS_CLASS: Record<MeasurementRow["status"], string> = {
  PENDING: "bg-warning/15 text-warning",
  APPROVED: "bg-success/15 text-success",
  REJECTED: "bg-danger/15 text-danger",
};

function MeasurementForm({
  projectId,
  measurement,
  onDone,
}: {
  projectId: string;
  measurement?: MeasurementRow;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = measurement ? updateMeasurementAction : createMeasurementAction;
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
      {measurement ? <input type="hidden" name="measurementId" value={measurement.id} /> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="label">Referência</label>
          <input
            name="referenceDate"
            type="date"
            required
            defaultValue={measurement ? measurement.referenceDate.toISOString().slice(0, 10) : undefined}
            className="input"
          />
        </div>
        <div>
          <label className="label">Valor previsto</label>
          <input
            name="plannedValue"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={measurement?.plannedValue}
            className="input"
          />
        </div>
        <div>
          <label className="label">Valor medido</label>
          <input
            name="measuredValue"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={measurement?.measuredValue}
            className="input"
          />
        </div>
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="Observações (opcional)"
        defaultValue={measurement?.notes ?? ""}
        className="input"
      />
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-ghost text-xs">
          {pending ? "Salvando…" : measurement ? "Salvar edição" : "Registrar medição"}
        </button>
        {measurement ? (
          <button type="button" onClick={onDone} className="text-xs text-muted hover:text-foreground">
            Cancelar edição
          </button>
        ) : null}
      </div>
    </form>
  );
}

function RejectForm({ projectId, measurementId }: { projectId: string; measurementId: string }) {
  const [state, action, pending] = useActionState(rejectMeasurementAction, initial);
  return (
    <form action={action} className="flex flex-1 items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="measurementId" value={measurementId} />
      <input name="reason" required placeholder="Motivo da reprovação" className="input flex-1 text-xs" />
      <button type="submit" disabled={pending} className="btn-danger text-xs">
        Reprovar
      </button>
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
    </form>
  );
}

function MeasurementRowItem({ projectId, measurement }: { projectId: string; measurement: MeasurementRow }) {
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approveState, approveAction, approvePending] = useActionState(approveMeasurementAction, initial);
  const [cancelState, cancelAction] = useActionState(cancelMeasurementAction, initial);

  if (editing) {
    return (
      <li className="py-3">
        <MeasurementForm projectId={projectId} measurement={measurement} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {formatDate(measurement.referenceDate)}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[measurement.status]}`}>
              {STATUS_LABEL[measurement.status]}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Previsto {formatCurrency(measurement.plannedValue)} · Medido{" "}
            {formatCurrency(measurement.measuredValue)}
          </div>
          {measurement.notes ? <p className="mt-1 text-xs text-muted">{measurement.notes}</p> : null}
          {measurement.status === "REJECTED" && measurement.rejectionReason ? (
            <p className="mt-1 text-xs text-danger">Motivo: {measurement.rejectionReason}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted">
            Registrado por {measurement.createdBy.name}
            {measurement.approvedBy ? ` · decidido por ${measurement.approvedBy.name}` : ""}
          </p>
        </div>

        {measurement.status === "PENDING" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <form action={approveAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="measurementId" value={measurement.id} />
              <button type="submit" disabled={approvePending} className="btn-ghost text-xs">
                Aprovar
              </button>
            </form>
            <button type="button" onClick={() => setRejecting((v) => !v)} className="btn-danger text-xs">
              Reprovar
            </button>
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted hover:text-foreground">
              Editar
            </button>
            <form action={cancelAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="measurementId" value={measurement.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (!window.confirm("Cancelar esta medição pendente?")) e.preventDefault();
                }}
                className="text-xs text-muted hover:text-danger"
              >
                Cancelar
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {approveState.errors?.length ? <p className="text-xs text-danger">{approveState.errors.join(" ")}</p> : null}
      {cancelState.errors?.length ? <p className="text-xs text-danger">{cancelState.errors.join(" ")}</p> : null}
      {rejecting ? <RejectForm projectId={projectId} measurementId={measurement.id} /> : null}
    </li>
  );
}

export function MeasurementsSection({
  projectId,
  rows,
  summary,
}: {
  projectId: string;
  rows: MeasurementRow[];
  summary: MeasurementSummary;
}) {
  return (
    <section className="card p-6">
      <h2 className="mb-3 text-sm font-semibold">Medições — orçamento vs. custo real</h2>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">Previsto (aprovado)</div>
          <div className="text-sm font-semibold">{formatCurrency(summary.totalPlanned)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Medido (aprovado)</div>
          <div className="text-sm font-semibold">{formatCurrency(summary.totalMeasured)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Variação</div>
          <div className={`text-sm font-semibold ${summary.variance > 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(summary.variance)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">% do contrato medido</div>
          <div className="text-sm font-semibold">{summary.percentOfContractMeasured.toFixed(1)}%</div>
        </div>
      </div>
      {summary.pendingCount > 0 ? (
        <p className="mb-4 text-xs text-warning">{summary.pendingCount} medição(ões) aguardando aprovação.</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Nenhuma medição registrada ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {rows.map((m) => (
            <MeasurementRowItem key={m.id} projectId={projectId} measurement={m} />
          ))}
        </ul>
      )}

      <MeasurementForm projectId={projectId} />
    </section>
  );
}
