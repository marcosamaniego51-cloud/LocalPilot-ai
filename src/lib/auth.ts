import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Tenant/staff authentication (Requirement 9.4).
//
// v1 uses email+password Credentials auth with JWT sessions, scoped to a
// single Tenant per user (tenant_users.tenantId). Magic-link email auth
// (via an Email provider + Auth.js adapter-backed verification tokens) is a
// straightforward addition later if passwordless login is wanted — the
// adapter is already wired below to make that swap easy.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.tenantUser.findUnique({
          where: { email },
        });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as { tenantId?: string }).tenantId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { tenantId?: string; role?: string }).tenantId =
          token.tenantId as string | undefined;
        (session.user as { tenantId?: string; role?: string }).role =
          token.role as string | undefined;
      }
      return session;
    },
  },
});
