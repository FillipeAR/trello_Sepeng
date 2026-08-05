"use client";

import { useActionState, useRef, useState } from "react";
import {
  cancelPurchaseOrderAction,
  createPurchaseOrderAction,
  deletePurchaseOrderAction,
  markPurchaseOrderDeliveredAction,
  updatePurchaseOrderAction,
  type ActionState,
} from "@/app/(app)/obras/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PurchaseOrderRow } from "@/modules/procurement/queries";

const initial: ActionState = {};

const STATUS_LABEL: Record<PurchaseOrderRow["status"], string> = {
  PENDING: "Pendente",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const STATUS_CLASS: Record<PurchaseOrderRow["status"], string> = {
  PENDING: "bg-warning/15 text-warning",
  DELIVERED: "bg-success/15 text-success",
  CANCELLED: "bg-border text-muted",
};

function PurchaseOrderForm({
  projectId,
  suppliers,
  order,
  onDone,
}: {
  projectId: string;
  suppliers: { id: string; name: string }[];
  order?: PurchaseOrderRow;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = order ? updatePurchaseOrderAction : createPurchaseOrderAction;
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
      {order ? <input type="hidden" name="purchaseOrderId" value={order.id} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="supplierId" required defaultValue="" className="input">
          <option value="" disabled>
            Fornecedor
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="value" type="number" step="0.01" min="0" placeholder="Valor (opcional)" className="input" />
      </div>
      <input name="description" required minLength={3} placeholder="O que está sendo comprado" className="input" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Data do pedido</label>
          <input
            name="orderedAt"
            type="date"
            defaultValue={order ? order.orderedAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Prazo de entrega</label>
          <input
            name="expectedDeliveryDate"
            type="date"
            required
            defaultValue={order ? order.expectedDeliveryDate.toISOString().slice(0, 10) : undefined}
            className="input"
          />
        </div>
      </div>
      <textarea name="notes" rows={2} placeholder="Observações (opcional)" defaultValue={order?.notes ?? ""} className="input" />
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-ghost text-xs">
          {pending ? "Salvando…" : order ? "Salvar edição" : "Registrar pedido"}
        </button>
        {order ? (
          <button type="button" onClick={onDone} className="text-xs text-muted hover:text-foreground">
            Cancelar edição
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PurchaseOrderRowItem({
  projectId,
  suppliers,
  order,
}: {
  projectId: string;
  suppliers: { id: string; name: string }[];
  order: PurchaseOrderRow;
}) {
  const [editing, setEditing] = useState(false);
  const [deliverState, deliverAction] = useActionState(markPurchaseOrderDeliveredAction, initial);
  const [cancelState, cancelAction] = useActionState(cancelPurchaseOrderAction, initial);
  const [deleteState, deleteAction] = useActionState(deletePurchaseOrderAction, initial);

  if (editing) {
    return (
      <li className="py-3">
        <PurchaseOrderForm projectId={projectId} suppliers={suppliers} order={order} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {order.description}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            {order.isLate ? (
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger">
                Atrasado
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-muted">
            {order.supplierName}
            {order.value !== null ? ` · ${formatCurrency(order.value)}` : ""} · prazo{" "}
            {formatDate(order.expectedDeliveryDate)}
            {order.deliveredAt ? ` · entregue ${formatDate(order.deliveredAt)}` : ""}
          </div>
          {order.notes ? <p className="mt-1 text-xs text-muted">{order.notes}</p> : null}
          {order.threatensSchedule ? (
            <p className="mt-1 text-xs font-medium text-danger">
              Atraso pode impactar o prazo da etapa atual da obra.
            </p>
          ) : null}
        </div>

        {order.status === "PENDING" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <form action={deliverAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <button type="submit" className="btn-ghost text-xs">
                Marcar entregue
              </button>
            </form>
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted hover:text-foreground">
              Editar
            </button>
            <form action={cancelAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (!window.confirm(`Cancelar o pedido "${order.description}"?`)) e.preventDefault();
                }}
                className="btn-danger text-xs"
              >
                Cancelar
              </button>
            </form>
            <form action={deleteAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="purchaseOrderId" value={order.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (!window.confirm(`Excluir o pedido "${order.description}"?`)) e.preventDefault();
                }}
                className="text-xs text-muted hover:text-danger"
              >
                Excluir
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {deliverState.errors?.length ? <p className="text-xs text-danger">{deliverState.errors.join(" ")}</p> : null}
      {cancelState.errors?.length ? <p className="text-xs text-danger">{cancelState.errors.join(" ")}</p> : null}
      {deleteState.errors?.length ? <p className="text-xs text-danger">{deleteState.errors.join(" ")}</p> : null}
    </li>
  );
}

export function ProcurementSection({
  projectId,
  orders,
  suppliers,
}: {
  projectId: string;
  orders: PurchaseOrderRow[];
  suppliers: { id: string; name: string }[];
}) {
  const late = orders.filter((o) => o.isLate).length;

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Suprimentos — pedidos de compra</h2>
      <p className="mb-4 text-xs text-muted">Fornecedor, prazo de entrega e impacto no cronograma.</p>
      {late > 0 ? <p className="mb-4 text-xs text-danger">{late} pedido(s) atrasado(s).</p> : null}

      {suppliers.length === 0 ? (
        <p className="mb-4 text-sm text-muted">
          Nenhum fornecedor cadastrado ainda —{" "}
          <a href="/admin/fornecedores" className="text-primary hover:underline">
            cadastre um
          </a>{" "}
          antes de registrar um pedido.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Nenhum pedido de compra registrado ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {orders.map((o) => (
            <PurchaseOrderRowItem key={o.id} projectId={projectId} suppliers={suppliers} order={o} />
          ))}
        </ul>
      )}

      {suppliers.length > 0 ? <PurchaseOrderForm projectId={projectId} suppliers={suppliers} /> : null}
    </section>
  );
}
