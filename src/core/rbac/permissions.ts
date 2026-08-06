/**
 * Catálogo de permissões. Papéis são DADOS (tabela `roles`), mas as chaves de
 * permissão são código — é o vocabulário que a aplicação sabe verificar.
 *
 * Formato: `recurso:ação[:escopo]`
 */

export const PERMISSIONS = {
  // Obras
  PROJECT_CREATE: "project:create",
  PROJECT_READ_ALL: "project:read:all",
  PROJECT_READ_DEPARTMENT: "project:read:department",
  PROJECT_READ_ASSIGNED: "project:read:assigned",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  PROJECT_UPDATE_PROGRESS: "project:update:progress",

  // Etapas do fluxo
  STAGE_COMPLETE: "stage:complete",
  STAGE_ROLLBACK: "stage:rollback",
  STAGE_REJECT: "stage:reject",

  // Configuração do fluxo
  WORKFLOW_READ: "workflow:read",
  WORKFLOW_MANAGE: "workflow:manage",

  // Administração
  USER_MANAGE: "user:manage",
  ROLE_MANAGE: "role:manage",
  DEPARTMENT_MANAGE: "department:manage",
  STAFF_MANAGE: "staff:manage",

  // Transversal
  AUDIT_READ: "audit:read",
  REPORT_READ: "report:read",
  COMMENT_CREATE: "comment:create",
  TASK_MANAGE: "task:manage",
  NEWS_MANAGE: "news:manage",

  // Financeiro
  MEASUREMENT_MANAGE: "measurement:manage",
  PROJECT_READ_CONTRACT_VALUE: "project:read:contract_value",

  // Compliance
  DOCUMENT_MANAGE: "document:manage",

  // Suprimentos
  PROCUREMENT_MANAGE: "procurement:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: {
  key: PermissionKey;
  category: string;
  description: string;
}[] = [
  { key: PERMISSIONS.PROJECT_CREATE, category: "Obras", description: "Cadastrar nova obra" },
  { key: PERMISSIONS.PROJECT_READ_ALL, category: "Obras", description: "Ver todas as obras da empresa" },
  { key: PERMISSIONS.PROJECT_READ_DEPARTMENT, category: "Obras", description: "Ver obras que passaram ou estão no seu departamento" },
  { key: PERMISSIONS.PROJECT_READ_ASSIGNED, category: "Obras", description: "Ver apenas obras em que participa" },
  { key: PERMISSIONS.PROJECT_UPDATE, category: "Obras", description: "Editar dados cadastrais da obra" },
  { key: PERMISSIONS.PROJECT_DELETE, category: "Obras", description: "Arquivar obra" },
  { key: PERMISSIONS.PROJECT_UPDATE_PROGRESS, category: "Obras", description: "Registrar progresso, fotos e ocorrências" },
  { key: PERMISSIONS.STAGE_COMPLETE, category: "Fluxo", description: "Concluir etapa e avançar a obra" },
  { key: PERMISSIONS.STAGE_ROLLBACK, category: "Fluxo", description: "Devolver a obra para a etapa anterior" },
  { key: PERMISSIONS.STAGE_REJECT, category: "Fluxo", description: "Reprovar a obra no fluxo" },
  { key: PERMISSIONS.WORKFLOW_READ, category: "Fluxo", description: "Visualizar a configuração dos fluxos" },
  { key: PERMISSIONS.WORKFLOW_MANAGE, category: "Fluxo", description: "Criar, reordenar e publicar etapas e fluxos" },
  { key: PERMISSIONS.USER_MANAGE, category: "Administração", description: "Gerenciar usuários e acessos" },
  { key: PERMISSIONS.ROLE_MANAGE, category: "Administração", description: "Gerenciar papéis e permissões" },
  { key: PERMISSIONS.DEPARTMENT_MANAGE, category: "Administração", description: "Gerenciar departamentos" },
  { key: PERMISSIONS.STAFF_MANAGE, category: "Administração", description: "Gerenciar o cadastro de engenheiros e encarregados" },
  { key: PERMISSIONS.AUDIT_READ, category: "Transversal", description: "Consultar a trilha de auditoria" },
  { key: PERMISSIONS.REPORT_READ, category: "Transversal", description: "Acessar relatórios e indicadores" },
  { key: PERMISSIONS.COMMENT_CREATE, category: "Transversal", description: "Comentar em obras e etapas" },
  { key: PERMISSIONS.TASK_MANAGE, category: "Transversal", description: "Criar e concluir pendências" },
  { key: PERMISSIONS.NEWS_MANAGE, category: "Transversal", description: "Publicar notícias no Jornal Sepeng" },
  { key: PERMISSIONS.MEASUREMENT_MANAGE, category: "Financeiro", description: "Registrar e aprovar medições (orçamento vs. custo real)" },
  { key: PERMISSIONS.PROJECT_READ_CONTRACT_VALUE, category: "Financeiro", description: "Ver o valor de contrato da obra" },
  { key: PERMISSIONS.DOCUMENT_MANAGE, category: "Compliance", description: "Gerenciar documentos com validade (ART/RRT, alvará, licença, seguro)" },
  { key: PERMISSIONS.PROCUREMENT_MANAGE, category: "Suprimentos", description: "Gerenciar fornecedores e pedidos de compra" },
];

/**
 * Papéis padrão semeados por organização. São um ponto de partida editável
 * pela UI — não uma regra travada no código.
 */
export const DEFAULT_ROLES: {
  slug: string;
  name: string;
  description: string;
  departmentSlug: string | null;
  permissions: PermissionKey[];
}[] = [
  {
    slug: "administrador",
    name: "Administrador",
    description: "Acesso total, incluindo configuração de fluxos e permissões",
    departmentSlug: null,
    permissions: PERMISSION_CATALOG.map((p) => p.key),
  },
  {
    slug: "diretoria",
    name: "Diretoria",
    description: "Visão executiva de todas as obras e aprovação de planejamento",
    departmentSlug: "diretoria",
    permissions: [
      PERMISSIONS.PROJECT_READ_ALL,
      PERMISSIONS.PROJECT_UPDATE,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.STAGE_ROLLBACK,
      PERMISSIONS.STAGE_REJECT,
      PERMISSIONS.WORKFLOW_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
      PERMISSIONS.STAFF_MANAGE,
      PERMISSIONS.MEASUREMENT_MANAGE,
      PERMISSIONS.DOCUMENT_MANAGE,
      PERMISSIONS.PROCUREMENT_MANAGE,
      PERMISSIONS.PROJECT_READ_CONTRACT_VALUE,
      PERMISSIONS.NEWS_MANAGE,
    ],
  },
  {
    slug: "orcamento",
    name: "Orçamento",
    description: "Cadastra a obra ganha e alimenta os dados iniciais",
    departmentSlug: "orcamento",
    permissions: [
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.PROJECT_READ_ALL,
      PERMISSIONS.PROJECT_UPDATE,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
      PERMISSIONS.PROJECT_READ_CONTRACT_VALUE,
    ],
  },
  {
    slug: "rh",
    name: "RH",
    description: "Disponibilidade de pessoal, admissões e documentação",
    departmentSlug: "rh",
    permissions: [
      PERMISSIONS.PROJECT_READ_DEPARTMENT,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.STAGE_ROLLBACK,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
      PERMISSIONS.STAFF_MANAGE,
      PERMISSIONS.DOCUMENT_MANAGE,
    ],
  },
  {
    slug: "seguranca",
    name: "Segurança do Trabalho",
    description: "EPIs, treinamentos e liberação da equipe",
    departmentSlug: "seguranca",
    permissions: [
      PERMISSIONS.PROJECT_READ_DEPARTMENT,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.STAGE_ROLLBACK,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
    ],
  },
  {
    slug: "financeiro",
    name: "Financeiro",
    description: "Aprovação do orçamento operacional e liberação financeira",
    departmentSlug: "financeiro",
    permissions: [
      PERMISSIONS.PROJECT_READ_ALL,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.STAGE_ROLLBACK,
      PERMISSIONS.STAGE_REJECT,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
      PERMISSIONS.MEASUREMENT_MANAGE,
    ],
  },
  {
    slug: "suprimentos",
    name: "Suprimentos",
    description: "Compras, reserva de estoque e contratações",
    departmentSlug: "suprimentos",
    permissions: [
      PERMISSIONS.PROJECT_READ_DEPARTMENT,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.STAGE_ROLLBACK,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
      PERMISSIONS.PROCUREMENT_MANAGE,
    ],
  },
  {
    slug: "gestor-obra",
    name: "Gestor de Obra",
    description: "Conduz a execução: progresso, fotos e ocorrências",
    departmentSlug: "execucao",
    permissions: [
      PERMISSIONS.PROJECT_READ_ASSIGNED,
      PERMISSIONS.PROJECT_UPDATE_PROGRESS,
      PERMISSIONS.STAGE_COMPLETE,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.TASK_MANAGE,
    ],
  },
  {
    slug: "visualizador",
    name: "Visualizador",
    description: "Somente leitura",
    departmentSlug: null,
    permissions: [PERMISSIONS.PROJECT_READ_ALL, PERMISSIONS.REPORT_READ],
  },
];
