/**
 * Vercel domain API client (Requirement 3.4 / Task 5.5).
 *
 * Handles attaching/removing a custom domain on the Vercel project this
 * app is deployed to, and checking Vercel's own verification status for
 * it (Vercel does its own domain-config verification in addition to our
 * TXT-record ownership check below — the two are complementary: ours
 * proves the Tenant controls the domain's DNS *before* we tell them to
 * point it at us; Vercel's confirms the DNS is actually pointed
 * correctly *after* they do).
 *
 * Requires VERCEL_API_TOKEN and VERCEL_PROJECT_ID. Not exercised against
 * a real Vercel project in this sandbox — verify with real credentials
 * before relying on it in production.
 */

const VERCEL_API_BASE = "https://api.vercel.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function authHeaders(): Record<string, string> {
  const token = requireEnv("VERCEL_API_TOKEN");
  const teamId = process.env.VERCEL_TEAM_ID;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(teamId ? { "X-Vercel-Team-Id": teamId } : {}),
  };
}

function projectPath(path: string): string {
  const projectId = requireEnv("VERCEL_PROJECT_ID");
  const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  return `${VERCEL_API_BASE}/v9/projects/${projectId}${path}${teamQuery}`;
}

export type VercelDomainConfig = {
  configured: boolean;
  misconfigured: boolean;
};

/** Adds a domain to the Vercel project. Idempotent — Vercel returns 200 if already added. */
export async function addDomainToProject(domain: string): Promise<void> {
  const res = await fetch(projectPath("/domains"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: domain }),
  });

  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel addDomainToProject failed (${res.status}): ${body}`);
  }
}

/** Removes a domain from the Vercel project (e.g. Tenant disconnects it). */
export async function removeDomainFromProject(domain: string): Promise<void> {
  const res = await fetch(projectPath(`/domains/${domain}`), {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel removeDomainFromProject failed (${res.status}): ${body}`);
  }
}

/** Checks Vercel's DNS configuration status for a domain already added to the project. */
export async function getDomainConfig(domain: string): Promise<VercelDomainConfig> {
  const teamQuery = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  const res = await fetch(`${VERCEL_API_BASE}/v6/domains/${domain}/config${teamQuery}`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel getDomainConfig failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { misconfigured?: boolean };
  return {
    configured: !data.misconfigured,
    misconfigured: Boolean(data.misconfigured),
  };
}
