/**
 * Ressincroniza só o catálogo de permissões e os papéis padrão (sem tocar em
 * usuários, fluxo ou dados de negócio) — usado quando uma permissão nova é
 * adicionada ao código (ex.: staff:manage) e produção ainda não rodou o
 * seed completo desde então. Espelha exatamente o bloco "Papéis e
 * permissões" de prisma/seed.ts.
 *
 * Uso: npx tsx scripts/sync-permissions.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { DEFAULT_ROLES, PERMISSION_CATALOG } from "../src/core/rbac/permissions";

const ORG_SLUG = "sepeng";

async function main() {
  console.log("→ Semeando catálogo de permissões…");
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, category: p.category, description: p.description },
      update: { category: p.category, description: p.description },
    });
  }

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } });

  console.log("→ Papéis e permissões…");
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: r.slug } },
      create: {
        organizationId: org.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        isSystem: true,
      },
      update: { name: r.name, description: r.description },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({ where: { key: { in: [...r.permissions] } } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    console.log(`  ${r.slug}: ${perms.length} permissões.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
