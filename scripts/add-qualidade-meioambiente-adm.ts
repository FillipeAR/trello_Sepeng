/**
 * Adiciona três etapas paralelas à Diretoria — Qualidade, Meio Ambiente e
 * ADM (CNO, Comunicação Prévia, Seguro, PCMSO) — com trava de liberação:
 * rodam ao mesmo tempo, independentes entre si, e a etapa seguinte
 * (Execução) só libera quando as três (mais Segurança e RH, que já eram
 * paralelas) tiverem concluído (`joinPolicy: "ALL"`).
 *
 * Fluxo atual publicado localmente: Orçamento → Jurídico → Diretoria →
 * Segurança/RH (paralelas) → Execução → Finalizada. Diretoria bifurca em 5
 * ramos agora: Segurança, RH, Qualidade, Meio Ambiente, ADM.
 *
 * Achado ao inspecionar o fluxo atual: havia uma `WorkflowTransition` órfã
 * saindo de Diretoria (Diretoria → Segurança, `actionId: null`, sem
 * condição) que intercepta QUALQUER ação da etapa antes do
 * `action.targetStageId` — inclusive "Devolver ao Orçamento", que por causa
 * disso estava indo parar em Segurança em vez de Orçamento. Corrigida na
 * mesma migração: removida e substituída pelas 5 transições explícitas,
 * cada uma amarrada à ação "avancar" (mesmo cuidado de sempre com Diretoria
 * paralela — ver scripts/simplify-workflow-orcamento-suprimentos.ts e
 * scripts/enable-diretoria-external-completion.ts).
 *
 * Uso: npx tsx scripts/add-qualidade-meioambiente-adm.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { PERMISSIONS } from "../src/core/rbac/permissions";
import type { SessionContext } from "../src/server/actor";
import {
  createAction,
  createDraftVersion,
  createStage,
  createTransition,
  deleteTransition,
  publishVersion,
  updateAction,
  updateStage,
} from "../src/modules/workflow/commands";

const NEW_BRANCHES = [
  {
    slug: "qualidade",
    deptName: "Qualidade",
    stageName: "Qualidade",
    displayStatus: "Qualidade Aprovada",
    color: "#10b981",
  },
  {
    slug: "meio_ambiente",
    deptName: "Meio Ambiente",
    stageName: "Meio Ambiente",
    displayStatus: "Meio Ambiente Aprovado",
    color: "#65a30d",
  },
  {
    slug: "adm",
    deptName: "ADM",
    stageName: "ADM",
    displayStatus: "ADM Concluído",
    color: "#ec4899",
  },
] as const;

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

  // Departamentos novos — mesmo padrão do seed, cada etapa paralela com fila própria.
  const departments = new Map<string, string>();
  for (const branch of NEW_BRANCHES) {
    const dept = await prisma.department.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: branch.slug } },
      create: { organizationId: org.id, slug: branch.slug, name: branch.deptName },
      update: {},
    });
    departments.set(branch.slug, dept.id);
    console.log(`Departamento "${dept.name}" ok (${dept.id}).`);
  }

  const definition = await prisma.workflowDefinition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });

  const draft = await createDraftVersion(actor, { definitionId: definition.id });
  console.log(`Rascunho v${draft.version} criado (id ${draft.id}).`);

  const diretoria = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "diretoria" },
    include: { actions: true },
  });
  const seguranca = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "seguranca" },
    include: { actions: true },
  });
  const rh = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "rh" },
    include: { actions: true },
  });
  const execucao = await prisma.workflowStage.findFirstOrThrow({
    where: { versionId: draft.id, key: "execucao" },
  });

  // Remove a(s) transição(ões) órfã(s) clonadas do rascunho anterior — ver
  // achado no cabeçalho. Vão ser substituídas pelas 5 explícitas abaixo.
  const staleTransitions = await prisma.workflowTransition.findMany({ where: { fromStageId: diretoria.id } });
  for (const t of staleTransitions) {
    await deleteTransition(actor, { transitionId: t.id });
    console.log(`  - Transição órfã ${t.id} (Diretoria → ?, actionId=${t.actionId}) removida.`);
  }

  // Cria as 3 etapas novas + ações "Concluir"/"Devolver à Diretoria".
  const newStageIds = new Map<string, string>();
  for (const branch of NEW_BRANCHES) {
    const stage = await createStage(actor, {
      versionId: draft.id,
      data: {
        name: branch.stageName,
        displayStatus: branch.displayStatus,
        departmentId: departments.get(branch.slug)!,
        mode: "SEQUENTIAL",
        joinPolicy: "ALL",
        isInitial: false,
        isFinal: false,
        color: branch.color,
        completionMode: "FORM",
      },
    });
    newStageIds.set(branch.slug, stage.id);
    console.log(`  + Etapa "${stage.name}" criada.`);

    await createAction(actor, {
      stageId: stage.id,
      data: {
        label: `Concluir ${branch.stageName}`,
        kind: "ADVANCE",
        targetStageId: execucao.id,
        requiredPermission: PERMISSIONS.STAGE_COMPLETE,
        requiresComment: false,
        variant: "primary",
      },
    });

    const devolver = await createAction(actor, {
      stageId: stage.id,
      data: {
        label: "Devolver à Diretoria",
        kind: "RETURN",
        targetStageId: diretoria.id,
        requiredPermission: PERMISSIONS.STAGE_ROLLBACK,
        requiresComment: true,
        variant: "secondary",
      },
    });
    // actionSchema do editor ainda não expõe a variante "ghost" (usada pelo
    // botão secundário em DynamicStageForm) — mesmo tipo de lacuna já visto
    // em completionMode/company/area/avatarUrl. Ajuste direto, fora do schema.
    await prisma.stageAction.update({ where: { id: devolver.id }, data: { variant: "ghost" } });
  }

  // Diretoria vira etapa paralela com 5 ramos.
  await updateStage(actor, {
    stageId: diretoria.id,
    data: {
      name: diretoria.name,
      displayStatus: diretoria.displayStatus,
      description: diretoria.description,
      departmentId: diretoria.departmentId,
      slaHours: diretoria.slaHours,
      mode: "PARALLEL",
      joinPolicy: diretoria.joinPolicy,
      isInitial: diretoria.isInitial,
      isFinal: diretoria.isFinal,
      color: diretoria.color,
      completionMode: diretoria.completionMode,
      externalCompletionPath: diretoria.externalCompletionPath,
      externalCompletionLabel: diretoria.externalCompletionLabel,
    },
  });
  console.log(`  - Diretoria: mode = PARALLEL.`);

  const avancarDiretoria = diretoria.actions.find((a) => a.kind === "ADVANCE");
  if (!avancarDiretoria) throw new Error('Diretoria não tem ação "avancar".');

  const forkTargets = [seguranca.id, rh.id, newStageIds.get("qualidade")!, newStageIds.get("meio_ambiente")!, newStageIds.get("adm")!];
  for (const toStageId of forkTargets) {
    await createTransition(actor, {
      stageId: diretoria.id,
      data: { toStageId, actionId: avancarDiretoria.id, conditionOp: "always", conditionPath: null, conditionValue: null },
    });
  }
  console.log(`  - 5 transições criadas: Diretoria → Segurança/RH/Qualidade/Meio Ambiente/ADM (ação "avancar").`);

  // Segurança e RH viravam ramos irmãos de verdade agora: convergem direto
  // em Execução (antes formavam uma cadeia sequencial Segurança → RH →
  // Execução), e "devolver" de qualquer um dos dois volta pra Diretoria.
  const avancarSeguranca = seguranca.actions.find((a) => a.kind === "ADVANCE")!;
  await updateAction(actor, {
    actionId: avancarSeguranca.id,
    data: {
      label: avancarSeguranca.label,
      kind: avancarSeguranca.kind,
      targetStageId: execucao.id,
      requiredPermission: avancarSeguranca.requiredPermission,
      requiresComment: avancarSeguranca.requiresComment,
      variant: avancarSeguranca.variant as "primary" | "secondary" | "danger",
    },
  });
  console.log(`  - Segurança: "avancar" agora aponta direto pra Execução.`);

  const devolverRh = rh.actions.find((a) => a.kind === "RETURN")!;
  await updateAction(actor, {
    actionId: devolverRh.id,
    data: {
      label: devolverRh.label,
      kind: devolverRh.kind,
      targetStageId: diretoria.id,
      requiredPermission: devolverRh.requiredPermission,
      requiresComment: devolverRh.requiresComment,
      variant: devolverRh.variant as "primary" | "secondary" | "danger",
    },
  });
  console.log(`  - RH: "devolver" agora aponta pra Diretoria (não mais pra Segurança).`);

  // Reordena: os 5 ramos dividem a mesma posição (rodam ao mesmo tempo);
  // Execução e Finalizada deslocam pra depois deles. createStage/moveStage
  // não têm como expressar "mesma order pra vários irmãos" — ajuste direto,
  // mesmo padrão do script original de etapas paralelas.
  const orderByKey: Record<string, number> = {
    orcamento: 0,
    juridico: 1,
    diretoria: 2,
    seguranca: 3,
    rh: 3,
    qualidade: 3,
    meio_ambiente: 3,
    adm: 3,
    execucao: 4,
    finalizada: 5,
  };
  const allStages = await prisma.workflowStage.findMany({ where: { versionId: draft.id } });
  for (const stage of allStages) {
    const order = orderByKey[stage.key];
    if (order === undefined) {
      throw new Error(`Etapa "${stage.key}" sem order definida na migração.`);
    }
    if (stage.order !== order) {
      await prisma.workflowStage.update({ where: { id: stage.id }, data: { order } });
    }
  }
  console.log(`  - Ordens ajustadas: Segurança/RH/Qualidade/Meio Ambiente/ADM dividem a posição 3.`);

  const result = await publishVersion(actor, { versionId: draft.id });
  console.log(
    `\n✔ v${result.published.version} publicada. ${result.inFlight} obra(s) seguem travadas na versão anterior.`,
  );
  console.log(`  Diretoria agora bifurca em 5 ramos paralelos independentes.`);
  console.log(`  Execução só libera quando os 5 (Segurança, RH, Qualidade, Meio Ambiente, ADM) concluírem.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
