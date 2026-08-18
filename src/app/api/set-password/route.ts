import { NextResponse } from "next/server";
import { z } from "zod";
import { setPasswordFromToken } from "@/lib/auth/password-reset";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await setPasswordFromToken(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
