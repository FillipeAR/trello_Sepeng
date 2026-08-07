/**
 * Semeia a estrutura de cargos do organograma (`/admin/organograma`) com o
 * formato e os títulos do organograma de referência da Sepeng/BYD que a
 * empresa mandou — só a estrutura e os cargos, sem nomear as pessoas (elas
 * são atribuídas depois, por obra, na própria tela). Nomes de cargo
 * continuam 100% editáveis por ali, sem precisar de código.
 *
 * Idempotente: pula cargos cujo título já existe na organização (casando
 * pelo primeiro encontrado, sem checar o pai — rodar mais de uma vez não
 * duplica, mas também não corrige um cargo que já foi movido manualmente).
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
    existingTitles.add(title);
    console.log(`  + "${title}"${parentId ? "" : " (raiz)"}`);
    return created.id;
  }

  // `ensure` deduplica por título — não serve pra criar 3 irmãos com o mesmo
  // nome ("Diretor"). Conta quantos já existem na raiz e completa até 3.
  const existingDiretores = await prisma.orgChartPosition.findMany({
    where: { organizationId: org.id, title: "Diretor", parentId: null, deletedAt: null },
  });
  let diretor1 = existingDiretores[0]?.id ?? null;
  for (let i = existingDiretores.length; i < 3; i++) {
    const created = await createPosition(actor, { data: { title: "Diretor", parentId: null } });
    diretor1 ??= created.id;
    console.log(`  + "Diretor" (raiz)`);
  }
  if (!diretor1) throw new Error("Falha ao criar/encontrar o cargo raiz Diretor.");

  const gerenteContrato = await ensure("Gerente de Contrato", diretor1);
  const gerenteProducao = await ensure("Gerente de Produção", gerenteContrato);
  const gerenteEngenharia = await ensure("Gerente de Engenharia", gerenteContrato);

  const seguranca = await ensure("Segurança do Trabalho", gerenteProducao);
  await ensure("Engenheiro de Segurança", seguranca);
  await ensure("Supervisora", seguranca);
  const projetos = await ensure("Projetos", gerenteProducao);
  await ensure("Coordenador de Projeto", projetos);

  const qualidade = await ensure("Qualidade", gerenteEngenharia);
  await ensure("Engenheiro Civil - Qualidade", qualidade);
  const planejamento = await ensure("Planejamento", gerenteEngenharia);
  await ensure("Coordenador de Planejamento", planejamento);
  const custosMedicao = await ensure("Custos e Medição", gerenteEngenharia);
  await ensure("Engenheiro", custosMedicao);
  const admObra = await ensure("ADM de Obra", gerenteEngenharia);
  await ensure("Funcionário", admObra);

  console.log("\n✔ Estrutura do organograma pronta (sem pessoas atribuídas). Edite em /admin/organograma.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
