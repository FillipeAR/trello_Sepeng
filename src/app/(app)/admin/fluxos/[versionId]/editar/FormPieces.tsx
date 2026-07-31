"use client";

import { useState } from "react";

export function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}

export function ErrorBanner({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
      {errors.map((e) => (
        <div key={e}>{e}</div>
      ))}
    </div>
  );
}

// --- Etapa -------------------------------------------------------------------

interface StageDefaults {
  name?: string;
  displayStatus?: string;
  description?: string | null;
  departmentId?: string | null;
  slaHours?: number | null;
  mode?: string;
  joinPolicy?: string;
  isInitial?: boolean;
  isFinal?: boolean;
  color?: string;
}

export function StageFieldSet({
  defaults,
  departments,
  fieldErrors,
}: {
  defaults?: StageDefaults;
  departments: { id: string; name: string }[];
  fieldErrors?: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nome da etapa</label>
          <input name="name" required defaultValue={defaults?.name} className="input" />
          <FieldErrorText message={fieldErrors?.name} />
        </div>
        <div>
          <label className="label">Status exibido para quem acompanha</label>
          <input
            name="displayStatus"
            required
            defaultValue={defaults?.displayStatus}
            className="input"
            placeholder='Ex.: "RH Concluído"'
          />
          <FieldErrorText message={fieldErrors?.displayStatus} />
        </div>
      </div>

      <div>
        <label className="label">Descrição (opcional)</label>
        <textarea name="description" rows={2} defaultValue={defaults?.description ?? ""} className="input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Departamento</label>
          <select name="departmentId" defaultValue={defaults?.departmentId ?? ""} className="input">
            <option value="">Sem departamento</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">SLA (horas)</label>
          <input
            name="slaHours"
            type="number"
            min={1}
            defaultValue={defaults?.slaHours ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label">Cor</label>
          <input name="color" type="color" defaultValue={defaults?.color ?? "#64748b"} className="input h-10 p-1" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Modo</label>
          <select name="mode" defaultValue={defaults?.mode ?? "SEQUENTIAL"} className="input">
            <option value="SEQUENTIAL">Sequencial</option>
            <option value="PARALLEL">Paralela</option>
          </select>
        </div>
        <div>
          <label className="label">Política de junção (etapas paralelas)</label>
          <select name="joinPolicy" defaultValue={defaults?.joinPolicy ?? "ALL"} className="input">
            <option value="ALL">Todas precisam concluir</option>
            <option value="ANY">Qualquer uma conclui</option>
          </select>
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isInitial" defaultChecked={defaults?.isInitial} />
          Etapa inicial
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isFinal" defaultChecked={defaults?.isFinal} />
          Etapa final
        </label>
      </div>
    </div>
  );
}

// --- Campo ---------------------------------------------------------------------

const FIELD_TYPES: [string, string][] = [
  ["TEXT", "Texto curto"],
  ["TEXTAREA", "Texto longo"],
  ["NUMBER", "Número"],
  ["CURRENCY", "Valor (R$)"],
  ["DATE", "Data"],
  ["SELECT", "Lista (uma opção)"],
  ["MULTISELECT", "Lista (múltipla escolha)"],
  ["USER", "Usuário"],
  ["USER_MULTI", "Usuários (múltiplos)"],
  ["CHECKBOX", "Sim / Não"],
  ["FILE", "Arquivo"],
];

interface FieldDefaults {
  label?: string;
  type?: string;
  required?: boolean;
  helpText?: string | null;
  optionsRaw?: string;
}

export function FieldFieldSet({
  defaults,
  fieldErrors,
}: {
  defaults?: FieldDefaults;
  fieldErrors?: Record<string, string>;
}) {
  const [type, setType] = useState(defaults?.type ?? "TEXT");
  const showOptions = type === "SELECT" || type === "MULTISELECT";

  return (
    <div className="grid flex-1 gap-2 sm:grid-cols-[2fr_1.3fr_auto]">
      <div>
        <input name="label" required defaultValue={defaults?.label} placeholder="Rótulo do campo" className="input" />
        <FieldErrorText message={fieldErrors?.label} />
      </div>
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
        {FIELD_TYPES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 whitespace-nowrap text-xs">
        <input type="checkbox" name="required" defaultChecked={defaults?.required} /> Obrigatório
      </label>

      {showOptions ? (
        <div className="sm:col-span-3">
          <label className="label">Opções — uma por linha, no formato &quot;valor:Rótulo&quot;</label>
          <textarea
            name="optionsRaw"
            rows={3}
            defaultValue={defaults?.optionsRaw}
            className="input font-mono text-xs"
            placeholder={"sim:Sim\nnao:Não"}
          />
        </div>
      ) : null}

      <div className="sm:col-span-3">
        <input
          name="helpText"
          defaultValue={defaults?.helpText ?? ""}
          placeholder="Texto de ajuda (opcional)"
          className="input"
        />
      </div>
    </div>
  );
}

// --- Ação ----------------------------------------------------------------------

interface ActionDefaults {
  label?: string;
  kind?: string;
  targetStageId?: string | null;
  requiredPermission?: string | null;
  requiresComment?: boolean;
  variant?: string;
}

export function ActionFieldSet({
  defaults,
  stageOptions,
  permissionOptions,
}: {
  defaults?: ActionDefaults;
  stageOptions: { id: string; name: string }[];
  permissionOptions: { key: string; description: string }[];
}) {
  return (
    <div className="grid flex-1 gap-2 sm:grid-cols-3">
      <input
        name="label"
        required
        defaultValue={defaults?.label}
        placeholder="Rótulo da ação (ex.: Aprovar)"
        className="input"
      />
      <select name="kind" defaultValue={defaults?.kind ?? "ADVANCE"} className="input">
        <option value="ADVANCE">Avançar</option>
        <option value="RETURN">Devolver</option>
        <option value="REJECT">Reprovar</option>
        <option value="FINISH">Encerrar fluxo</option>
      </select>
      <select name="targetStageId" defaultValue={defaults?.targetStageId ?? ""} className="input">
        <option value="">Próxima etapa por ordem</option>
        {stageOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select name="requiredPermission" defaultValue={defaults?.requiredPermission ?? ""} className="input">
        <option value="">Permissão padrão (concluir etapa)</option>
        {permissionOptions.map((p) => (
          <option key={p.key} value={p.key}>
            {p.description}
          </option>
        ))}
      </select>
      <select name="variant" defaultValue={defaults?.variant ?? "primary"} className="input">
        <option value="primary">Estilo primário</option>
        <option value="secondary">Estilo secundário</option>
        <option value="danger">Estilo de alerta</option>
      </select>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="requiresComment" defaultChecked={defaults?.requiresComment} /> Exige
        justificativa
      </label>
    </div>
  );
}

// --- Transição -------------------------------------------------------------

const CONDITION_OPS: [string, string][] = [
  ["always", "Sempre (sem condição)"],
  ["eq", "Igual a"],
  ["neq", "Diferente de"],
  ["gt", "Maior que"],
  ["gte", "Maior ou igual a"],
  ["lt", "Menor que"],
  ["lte", "Menor ou igual a"],
  ["in", "Está na lista"],
  ["nin", "Não está na lista"],
  ["isEmpty", "Está vazio"],
  ["isNotEmpty", "Não está vazio"],
];

interface TransitionDefaults {
  toStageId?: string;
  actionId?: string | null;
  conditionOp?: string;
  conditionPath?: string | null;
  conditionValue?: string | null;
}

export function TransitionFieldSet({
  defaults,
  stageOptions,
  actionOptions,
}: {
  defaults?: TransitionDefaults;
  stageOptions: { id: string; name: string }[];
  actionOptions: { id: string; label: string }[];
}) {
  const [op, setOp] = useState(defaults?.conditionOp ?? "always");
  const needsPath = op !== "always";
  const needsValue = op !== "always" && op !== "isEmpty" && op !== "isNotEmpty";

  return (
    <div className="grid flex-1 gap-2 sm:grid-cols-3">
      <select name="toStageId" required defaultValue={defaults?.toStageId ?? ""} className="input">
        <option value="" disabled>
          Etapa de destino
        </option>
        {stageOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select name="actionId" defaultValue={defaults?.actionId ?? ""} className="input">
        <option value="">Qualquer ação desta etapa</option>
        {actionOptions.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <select name="conditionOp" value={op} onChange={(e) => setOp(e.target.value)} className="input">
        {CONDITION_OPS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {needsPath ? (
        <div className="sm:col-span-3 grid gap-2 sm:grid-cols-2">
          <div>
            <input
              name="conditionPath"
              defaultValue={defaults?.conditionPath ?? ""}
              placeholder='Campo — ex.: "project.contractValue"'
              className="input"
            />
          </div>
          {needsValue ? (
            <div>
              <input
                name="conditionValue"
                defaultValue={defaults?.conditionValue ?? ""}
                placeholder={op === "in" || op === "nin" ? "Valores separados por vírgula" : "Valor de comparação"}
                className="input"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
