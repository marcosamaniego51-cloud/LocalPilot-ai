import { auth } from "@/lib/auth";

/**
 * Tenant-scoped data-access guard (Requirements 9.1, 9.2, 9.3).
 *
 * Every server-side read/write that touches Tenant-owned data (sites, leads,
 * calls, email threads, subscriptions, etc.) must go through one of these
 * helpers rather than reading `tenantId` off the session directly. This
 * keeps "how do we know which tenant this request is allowed to touch" in
 * exactly one place, so a future bug in one route can't silently leak
 * cross-tenant data.
 */

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: "owner" | "staff";
};

type SessionUser = {
  id?: string;
  accountType?: "tenant" | "operator";
  tenantId?: string;
  role?: string;
};

/**
 * Resolves the current authenticated Tenant user's context. Throws if
 * there is no session, the session isn't a tenant-type account, or there's
 * no tenantId on it — callers should let this bubble up to a 401 response.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;

  if (!user?.id || user.accountType !== "tenant" || !user.tenantId) {
    throw new UnauthorizedError("No authenticated tenant session");
  }

  return {
    tenantId: user.tenantId,
    userId: user.id,
    role: (user.role as "owner" | "staff") ?? "staff",
  };
}

/**
 * Explicit admin/operator override for cross-tenant support & operations
 * views (Requirement 9.3). Distinct function name/shape from
 * requireTenantContext so cross-tenant access is always a deliberate,
 * greppable choice in the codebase rather than an accidental omission of a
 * tenant filter. Operator accounts (OperatorUser) are a separate table
 * from TenantUser, so this can never be satisfied by a Tenant session.
 */
export async function requireOperatorContext(): Promise<{ userId: string }> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;

  if (!user?.id || user.accountType !== "operator") {
    throw new UnauthorizedError("Operator account required");
  }

  return { userId: user.id };
}

/**
 * Role-based access within a Tenant account (Requirement 9.4 / Task 9.8).
 * Layered on top of requireTenantContext() — use this for owner-only
 * actions/pages (e.g. billing) rather than checking `role` inline at each
 * call site, so the "which pages are owner-only" policy stays centralized
 * and greppable in one place.
 */
export async function requireTenantOwner(): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "owner") {
    throw new UnauthorizedError("Owner role required");
  }
  return ctx;
}
