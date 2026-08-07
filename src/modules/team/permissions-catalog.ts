/**
 * Checklist de "permissões" exibido no inspetor de cargo da tela Equipe da
 * Obra. Puramente informativo — fica salvo em `TeamPosition.permissions`
 * pra exibição, mas **não controla acesso a nada**. O controle de acesso
 * real do sistema é só o RBAC por papel (`src/core/rbac`).
 */
export const TEAM_POSITION_PERMISSIONS = [
  { key: "acompanhamento_obra", label: "Acompanhamento da obra" },
  { key: "diario_obra", label: "Diário de obra" },
  { key: "fvs_checklists", label: "FVS e Checklists" },
  { key: "relatorios", label: "Relatórios" },
  { key: "documentos", label: "Documentos" },
  { key: "planejamento", label: "Planejamento" },
  { key: "custos_medicao", label: "Custos e Medição" },
  { key: "financeiro", label: "Financeiro" },
  { key: "config_obra", label: "Configurações da obra" },
] as const;

export type TeamPositionPermissionKey = (typeof TEAM_POSITION_PERMISSIONS)[number]["key"];
