/**
 * Semeia uma estrutura inicial de cargos no organograma (`/admin/organograma`),
 * só pra não nascer vazio — formato inspirado no organograma de referência da
 * Sepeng (Diretores → Gerente de Contrato → Gerentes de área → chefias de
 * departamento). Nomes de cargo são só um ponto de partida: 100% editável
 * depois pela própria tela, sem precisar de código.
 *
 * Idempotente: pula cargos cujo título já existe na organização.
 *
 * Uso: npx tsx scripts/seed-orgchart-template.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createPosition } from "../src/modules/orgchart/commands";

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

  const existingTitles = new Set(
    (await prisma.orgChartPosition.findMany({ where: { organizationId: org.id, deletedAt: null } })).map(
      (p) => p.title,
    ),
  );

  async function ensure(title: string, parentId: string | null): Promise<string> {
    if (existingTitles.has(title)) {
      const existing = await prisma.orgChartPosition.findFirstOrThrow({
        where: { organizationId: org.id, title, deletedAt: null },
      });
      return existing.id;
    }
    const created = await createPosition(actor, { data: { title, parentId } });
    console.log(`  + "${title}"${parentId ? "" : " (raiz)"}`);
    return created.id;
  }

  const diretor1 = await ensure("Diretor", null);
  await ensure("Diretor", null);
  await ensure("Diretor", null);

  const gerenteContrato = await ensure("Gerente de Contrato", diretor1);
  const gerenteProducao = await ensure("Gerente de Produção", gerenteContrato);
  const gerenteEngenharia = await ensure("Gerente de Engenharia", gerenteContrato);

  await ensure("Segurança do Trabalho", gerenteProducao);
  await ensure("Projetos", gerenteProducao);

  await ensure("Qualidade", gerenteEngenharia);
  await ensure("Planejamento", gerenteEngenharia);
  await ensure("Custos e Medição", gerenteEngenharia);

  console.log("\n✔ Estrutura inicial do organograma pronta. Edite livremente em /admin/organograma.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
