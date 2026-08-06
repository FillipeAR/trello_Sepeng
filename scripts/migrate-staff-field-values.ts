/**
 * Converte `StageFieldValue` de campos STAFF do formato antigo (nome do
 * profissional como string solta) pro novo (id do `Professional`) — troca
 * feita em `DynamicStageForm`/`executeStageAction` pra permitir e-mail
 * confiável ao selecionar alguém (nome não é chave estável: pode repetir ou
 * mudar). Casa por nome dentro da mesma organização; loga o que não achar
 * pra ajuste manual (o valor não é alterado nesse caso).
 *
 * Uso: npx tsx scripts/migrate-staff-field-values.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  const values = await prisma.stageFieldValue.findMany({
    where: { field: { type: "STAFF" } },
    include: { field: true },
  });

  if (values.length === 0) {
    console.log("Nenhum valor de campo STAFF encontrado.");
    return;
  }

  console.log(`${values.length} valor(es) de campo STAFF encontrados.`);

  let converted = 0;
  let alreadyId = 0;
  let unmatched = 0;

  for (const fv of values) {
    if (typeof fv.value !== "string" || !fv.value) continue;

    const byId = await prisma.professional.findFirst({
      where: { id: fv.value, organizationId: fv.organizationId },
      select: { id: true },
    });
    if (byId) {
      alreadyId += 1;
      continue;
    }

    const byName = await prisma.professional.findFirst({
      where: { name: fv.value, organizationId: fv.organizationId },
      select: { id: true, name: true },
    });

    if (!byName) {
      unmatched += 1;
      console.warn(
        `  ⚠ Sem correspondência: campo "${fv.field.label}" (${fv.id}) = "${fv.value}" — ajuste manual necessário.`,
      );
      continue;
    }

    await prisma.stageFieldValue.update({ where: { id: fv.id }, data: { value: byName.id } });
    converted += 1;
    console.log(`  ✔ "${fv.value}" → ${byName.id} (campo "${fv.field.label}")`);
  }

  console.log(`\nConcluído: ${converted} convertido(s), ${alreadyId} já eram id, ${unmatched} sem correspondência.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
