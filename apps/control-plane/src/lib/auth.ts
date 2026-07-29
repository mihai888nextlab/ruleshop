import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    platformRole?: Role | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      platformRole?: Role | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    platformRole?: Role | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parolă", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.platformRole = user.platformRole ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.platformRole = token.platformRole ?? null;
      }
      return session;
    },
  },
});

export async function getMembership(storeId: string, userId: string) {
  return prisma.membership.findUnique({
    where: { storeId_userId: { storeId, userId } },
  });
}

const STAFF: Role[] = ["OPERATOR", "STORE_ADMIN", "PLATFORM_ADMIN"];
const ADMINS: Role[] = ["STORE_ADMIN", "PLATFORM_ADMIN"];

export async function requireStoreRole(
  storeId: string,
  min: "CUSTOMER" | "OPERATOR" | "STORE_ADMIN" | "PLATFORM_ADMIN" = "OPERATOR",
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: "Neautentificat" };
  }
  if (session.user.platformRole === "PLATFORM_ADMIN") {
    return { ok: true as const, session, role: "PLATFORM_ADMIN" as Role };
  }
  if (min === "PLATFORM_ADMIN") {
    return { ok: false as const, status: 403, error: "Acces interzis" };
  }
  const membership = await getMembership(storeId, session.user.id);
  if (!membership) {
    return { ok: false as const, status: 403, error: "Nu aparții acestui magazin" };
  }
  const role = membership.role;
  if (min === "STORE_ADMIN" && !ADMINS.includes(role)) {
    return { ok: false as const, status: 403, error: "Necesită administrator magazin" };
  }
  if (min === "OPERATOR" && !STAFF.includes(role)) {
    return { ok: false as const, status: 403, error: "Necesită operator" };
  }
  return { ok: true as const, session, role };
}
