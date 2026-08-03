/** Script de teste: força a primeira StageInstance ativa a ter dueAt vencido. */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  const instance = await prisma.stageInstance.findFirst({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] }, slaBreached: false },
    include: { stage: true, project: { select: { code: true, name: true } } },
  });
  if (!instance) {
    console.log("Nenhuma etapa ativa sem SLA já marcado.");
    return;
  }

  await prisma.stageInstance.update({
    where: { id: instance.id },
    data: { dueAt: new Date(Date.now() - 60 * 60 * 1000) },
  });

  console.log(`Forçado: "${instance.stage.name}" na obra ${instance.project.code} (${instance.project.name}) agora está vencida.`);
  console.log("stageInstanceId:", instance.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
