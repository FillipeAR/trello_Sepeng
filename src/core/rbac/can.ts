import { PERMISSIONS, type PermissionKey } from "./permissions";

/** Identidade efetiva do usuário dentro de uma organização. */
export interface Actor {
  userId: string;
  organizationId: string;
  roleSlug: string;
  departmentId: string | null;
  permissions: readonly string[];
}

export interface ProjectScope {
  /** Departamento dono da etapa atual da obra. */
  currentStageDepartmentId?: string | null;
  /** Departamentos por onde a obra já passou. */
  visitedDepartmentIds?: readonly string[];
  /** Usuários alocados na obra (gerente, encarregado, equipe). */
  assignedUserIds?: readonly string[];
}

export function hasPermission(actor: Actor, permission: PermissionKey): boolean {
  return actor.permissions.includes(permission);
}

export function hasAnyPermission(
  actor: Actor,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.some((p) => actor.permissions.includes(p));
}

/** Pode ver o valor de contrato da obra? Restrito por padrão a Orçamento/Diretoria/Admin. */
export function canReadContractValue(actor: Actor): boolean {
  return hasPermission(actor, PERMISSIONS.PROJECT_READ_CONTRACT_VALUE);
}

/**
 * Pode ver esta obra? Três escopos de leitura, do mais amplo ao mais restrito.
 * A ausência de qualquer um deles nega — não existe leitura implícita.
 */
export function canReadProject(actor: Actor, scope: ProjectScope): boolean {
  if (hasPermission(actor, PERMISSIONS.PROJECT_READ_ALL)) return true;

  if (hasPermission(actor, PERMISSIONS.PROJECT_READ_DEPARTMENT)) {
    if (!actor.departmentId) return false;
    if (scope.currentStageDepartmentId === actor.departmentId) return true;
    if (scope.visitedDepartmentIds?.includes(actor.departmentId)) return true;
  }

  if (hasPermission(actor, PERMISSIONS.PROJECT_READ_ASSIGNED)) {
    if (scope.assignedUserIds?.includes(actor.userId)) return true;
  }

  return false;
}

/**
 * Pode concluir/agir na etapa atual? Exige a permissão da ação E pertencer ao
 * departamento dono da etapa — salvo quem tem `workflow:manage` (administrador),
 * que pode destravar qualquer etapa.
 */
export function canActOnStage(
  actor: Actor,
  args: {
    stageDepartmentId: string | null;
    requiredPermission?: string | null;
  },
): { allowed: boolean; reason?: string } {
  const required = args.requiredPermission ?? PERMISSIONS.STAGE_COMPLETE;

  if (hasPermission(actor, PERMISSIONS.WORKFLOW_MANAGE)) {
    return { allowed: true };
  }

  if (!actor.permissions.includes(required)) {
    return {
      allowed: false,
      reason: `Seu perfil não possui a permissão "${required}".`,
    };
  }

  // Etapa sem departamento definido é aberta a quem tem a permissão.
  if (args.stageDepartmentId && actor.departmentId !== args.stageDepartmentId) {
    return {
      allowed: false,
      reason: "Esta etapa pertence a outro departamento.",
    };
  }

  return { allowed: true };
}
