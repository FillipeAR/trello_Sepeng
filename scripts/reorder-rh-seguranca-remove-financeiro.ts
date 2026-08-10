/**
 * Duas mudanças no fluxo padrão, na mesma versão:
 *
 * 1. Diretoria deixa de bifurcar em paralelo para RH e Segurança do Trabalho
 *    (mode PARALLEL, joinPolicy ANY em Financeiro liberava com o primeiro que
 *    terminasse e pulava o outro). Vira sequencial: Diretoria -> Segurança do
 *    Trabalho -> RH. Ações de "devolver" são reamarradas para o vizinho
 *    correto (Segurança devolve à Diretoria; RH devolve à Segurança).
 * 2. Etapa Financeiro é removida por completo — RH passa a avançar direto
 *    para Execução.
 *
 * Uso: npx tsx scripts/reorder-rh-seguranca-remove-financeiro.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import {
  createDraftVersion,
  deleteStage,
  deleteTransition,
  moveStage,
  publishVersion,
  updateAction,
  updateStage,
} from "../src/modules/workflow/commands";

const KNOWN_VARIANTS = new Set(["primary", "secondary", "danger"]);
function normalizeVariant(variant: string | null): "primary" | "secondary" | "danger" {
  if (variant && KNOWN_VARIANTS.has(variant)) return variant as "primary" | "secondary" | "danger";
  return "secondary"; // "ghost" (legado) e afins caem aqui — mais próximo pra ação de devolução.
}

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sepeng" } });

  const membership = await prisma.membership.findFirstOrThrow({
    where: { organizationId: org.id, user: { email: "admin@obraflow.com" } },
    include: {
      user: true,
      department: true,
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });

  const actor: SessionContext = {
    userId: membership.userId,
    organizationId: membership.organizationId,
    roleSlug: membership.role.slug,
    departmentId: membership.departmentId,
    permissions: membership.role.permissions.map((rp) => rp.permission.key),
    userName: membership.user.name,
    userEmail: membership.user.email,
    organizationName: org.name,
    departmentName: membership.department?.name ?? null,
    roleName: membership.role.name,
  };

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const draft = await createDraftVersion(actor, { definitionId: definition.id });
  console.log(`Rascunho v${draft.version} criado (id ${draft.id}).`);

  const diretoria = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "diretoria" },
    include: { actions: true },
  });
  const rh = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "rh" },
    include: { actions: true },
  });
  const seguranca = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "seguranca" },
    include: { actions: true },
  });
  const financeiro = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "financeiro" },
  });
  const execucao = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "execucao" },
  });

  // 1a. Diretoria deixa de ser PARALLEL — só sobra um destino (Segurança).
  await updateStage(actor, {
    stageId: diretoria.id,
    data: {
      name: diretoria.name,
      displayStatus: diretoria.displayStatus,
      description: diretoria.description,
      departmentId: diretoria.departmentId,
      slaHours: diretoria.slaHours,
      mode: "SEQUENTIAL",
      joinPolicy: diretoria.joinPolicy,
      isInitial: diretoria.isInitial,
      isFinal: diretoria.isFinal,
      color: diretoria.color,
      completionMode: diretoria.completionMode,
      externalCompletionPath: diretoria.externalCompletionPath,
      externalCompletionLabel: diretoria.externalCompletionLabel,
    },
  });
  console.log("Diretoria: mode PARALLEL -> SEQUENTIAL.");

  const diretoriaTransitions = await prisma.workflowTransition.findMany({ where: { fromStageId: diretoria.id } });
  const transitionToRh = diretoriaTransitions.find((t) => t.toStageId === rh.id);
  if (transitionToRh) {
    await deleteTransition(actor, { transitionId: transitionToRh.id });
    console.log("Transição Diretoria -> RH removida (Diretoria -> Segurança é o único caminho agora).");
  }

  // 1b. Segurança do Trabalho passa a vir logo depois da Diretoria, e avança para RH.
  const segurancaAdvance = seguranca.actions.find((a) => a.kind === "ADVANCE");
  if (segurancaAdvance) {
    await updateAction(actor, {
      actionId: segurancaAdvance.id,
      data: {
        label: segurancaAdvance.label,
        kind: segurancaAdvance.kind,
        targetStageId: rh.id,
        requiredPermission: segurancaAdvance.requiredPermission,
        requiresComment: segurancaAdvance.requiresComment,
        variant: normalizeVariant(segurancaAdvance.variant),
      },
    });
    console.log(`Ação "${segurancaAdvance.label}" (Segurança): destino Financeiro -> RH.`);
  }
  const segurancaReturn = seguranca.actions.find((a) => a.kind === "RETURN");
  if (segurancaReturn) {
    await updateAction(actor, {
      actionId: segurancaReturn.id,
      data: {
        label: "Devolver à Diretoria",
        kind: segurancaReturn.kind,
        targetStageId: diretoria.id,
        requiredPermission: segurancaReturn.requiredPermission,
        requiresComment: segurancaReturn.requiresComment,
        variant: normalizeVariant(segurancaReturn.variant),
      },
    });
    console.log(`Ação "${segurancaReturn.label}" (Segurança) -> "Devolver à Diretoria", destino RH -> Diretoria.`);
  }

  // 1c. RH passa a vir depois de Segurança, e avança direto para Execução (Financeiro sai do fluxo).
  const rhAdvance = rh.actions.find((a) => a.kind === "ADVANCE");
  if (rhAdvance) {
    await updateAction(actor, {
      actionId: rhAdvance.id,
      data: {
        label: rhAdvance.label,
        kind: rhAdvance.kind,
        targetStageId: execucao.id,
        requiredPermission: rhAdvance.requiredPermission,
        requiresComment: rhAdvance.requiresComment,
        variant: normalizeVariant(rhAdvance.variant),
      },
    });
    console.log(`Ação "${rhAdvance.label}" (RH): destino Financeiro -> Execução.`);
  }
  const rhReturn = rh.actions.find((a) => a.kind === "RETURN");
  if (rhReturn) {
    await updateAction(actor, {
      actionId: rhReturn.id,
      data: {
        label: "Devolver à Segurança",
        kind: rhReturn.kind,
        targetStageId: seguranca.id,
        requiredPermission: rhReturn.requiredPermission,
        requiresComment: rhReturn.requiresComment,
        variant: normalizeVariant(rhReturn.variant),
      },
    });
    console.log(`Ação "${rhReturn.label}" (RH) -> "Devolver à Segurança", destino Diretoria -> Segurança.`);
  }

  // 1d. Troca a ordem: Segurança antes de RH.
  await moveStage(actor, { stageId: rh.id, direction: "down" });
  console.log("Ordem: Segurança do Trabalho antes de Recursos Humanos.");

  // 2. Remove Financeiro (nada mais aponta pra ela depois dos passos acima).
  await deleteStage(actor, { stageId: financeiro.id });
  console.log("Etapa Financeiro removida.");

  const { published } = await publishVersion(actor, { versionId: draft.id });
  console.log(`Versão v${published.version} publicada.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
