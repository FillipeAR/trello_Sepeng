import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { checkLoginRateLimit, recordLoginAttempt } from "@/modules/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Muitas tentativas falhas seguidas (mesma conta ou mesma origem) — ver `modules/auth/rate-limit.ts`. */
export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

/** Cadastro próprio pendente de confirmação de e-mail — ver `modules/auth/commands.ts`. */
export class EmailNotVerifiedSignin extends CredentialsSignin {
  code = "email_not_verified";
}

function getClientIp(request?: Request): string | null {
  const forwarded = request?.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const ip = getClientIp(request);

        const rateLimit = await checkLoginRateLimit(email, ip);
        if (!rateLimit.allowed) {
          await recordLoginAttempt(email, ip, false);
          throw new RateLimitedSignin();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive || user.deletedAt) {
          await recordLoginAttempt(email, ip, false);
          return null;
        }

        const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordOk) {
          await recordLoginAttempt(email, ip, false);
          return null;
        }

        if (!user.emailVerifiedAt) {
          await recordLoginAttempt(email, ip, false);
          throw new EmailNotVerifiedSignin();
        }

        await recordLoginAttempt(email, ip, true);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
