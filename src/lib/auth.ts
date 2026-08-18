import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Tenant/staff + platform operator authentication (Requirements 9.3, 9.4).
//
// v1 uses a single email+password Credentials provider with JWT sessions
// that authenticates against two distinct tables: TenantUser (scoped to a
// single Tenant, role owner/staff) and OperatorUser (platform staff, no
// Tenant scope, used for admin/discovery/support views). A session ends up
// as EITHER a tenant session (accountType: "tenant", tenantId set, role
// owner/staff) OR an operator session (accountType: "operator", no
// tenantId) — the tenant-context helpers in src/lib/tenant-context.ts key
// off this to keep the two access patterns from ever being confused.
//
// Magic-link email auth (via an Email provider + Auth.js adapter-backed
// verification tokens) is a straightforward addition later for Tenant
// login if passwordless login is wanted.
type AuthorizedUser = {
  id: string;
  email: string;
  accountType: "tenant" | "operator";
  tenantId?: string;
  role?: string;
};

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
      async authorize(credentials): Promise<AuthorizedUser | null> {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const tenantUser = await prisma.tenantUser.findUnique({
          where: { email },
        });
        if (tenantUser?.passwordHash) {
          const valid = await bcrypt.compare(password, tenantUser.passwordHash);
          if (valid) {
            return {
              id: tenantUser.id,
              email: tenantUser.email,
              accountType: "tenant",
              tenantId: tenantUser.tenantId,
              role: tenantUser.role,
            };
          }
        }

        const operatorUser = await prisma.operatorUser.findUnique({
          where: { email },
        });
        if (operatorUser) {
          const valid = await bcrypt.compare(password, operatorUser.passwordHash);
          if (valid) {
            return {
              id: operatorUser.id,
              email: operatorUser.email,
              accountType: "operator",
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as AuthorizedUser;
        token.accountType = u.accountType;
        token.tenantId = u.tenantId;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          accountType: token.accountType as "tenant" | "operator" | undefined,
          tenantId: token.tenantId as string | undefined,
          role: token.role as string | undefined,
        });
      }
      return session;
    },
  },
});
