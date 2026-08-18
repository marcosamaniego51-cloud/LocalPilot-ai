import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Health check endpoint (Task 12.1/12.3) for the Next.js app deployment.
 * Used by Vercel/uptime monitoring to verify the app can actually reach
 * its database, not just that the process is up — a DB outage should
 * show as unhealthy, not a false-positive "200 OK, everything's fine."
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", db: "unreachable", error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
