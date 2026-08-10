/**
 * Liga `User.emailVerifiedAt` pra toda conta já existente (admin@, orcamento@,
 * Erika/Thaina etc.) — sem isso, a checagem nova de e-mail verificado em
 * `src/server/auth.ts` trancaria todo mundo pra fora do próprio sistema depois
 * do deploy, já que essas contas nasceram antes do conceito existir.
 *
 * Uso: npx tsx scripts/backfill-email-verified.ts
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  console.log(`${result.count} conta(s) marcada(s) como e-mail verificado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
