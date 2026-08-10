/**
 * Cria contas nomeadas de verdade pro setor de Orçamento (Erika e Thaina),
 * no lugar do login único compartilhado (`orcamento@obraflow.com`). E-mails
 * são um padrão temporário (`nome.orcamento@sepeng.com.br`) até termos os
 * e-mails reais delas — trocar depois é só editar em /admin/usuarios.
 *
 * Senha gerada é única por conta, forte, e NUNCA a senha pública de demo
 * (obraflow123) — impressa no final pra repasse manual e seguro. Não fica
 * salva em lugar nenhum além do hash no banco.
 *
 * Uso: npx tsx scripts/create-orcamento-users.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/server/db";
import type { SessionContext } from "../src/server/actor";
import { createUser } from "../src/modules/users/commands";

function generatePassword(): string {
  // 16 caracteres, alfanumérico + símbolos, sem ambiguidade visual (sem 0/O/l/1/I).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
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

  const orcamentoRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: org.id, slug: "orcamento" },
  });
  const orcamentoDept = await prisma.department.findFirstOrThrow({
    where: { organizationId: org.id, slug: "orcamento" },
  });

  const people = [
    { name: "Erika", email: "erika.orcamento@sepeng.com.br" },
    { name: "Thaina", email: "thaina.orcamento@sepeng.com.br" },
  ];

  const results: { name: string; email: string; password: string }[] = [];

  for (const person of people) {
    const password = generatePassword();
    await createUser(actor, {
      data: {
        name: person.name,
        email: person.email,
        password,
        roleId: orcamentoRole.id,
        departmentId: orcamentoDept.id,
      },
    });
    results.push({ ...person, password });
    console.log(`✔ Conta criada: ${person.name} <${person.email}>`);
  }

  console.log("\n==== CREDENCIAIS — repassar com segurança, não deixar neste terminal ====");
  for (const r of results) {
    console.log(`${r.name}: ${r.email} / ${r.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
