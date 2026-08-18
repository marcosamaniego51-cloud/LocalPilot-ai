import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperatorContext, UnauthorizedError } from "@/lib/tenant-context";
import { deletePersonalDataByIdentity } from "@/lib/admin/data-deletion";

// Operator-triggered data deletion (Requirement 10.4 / Task 10.4).
// Not self-serve — see design.md Section 11 and the doc comment on
// deletePersonalDataByIdentity() for why.

const deleteRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: "Provide at least an email or phone number",
  });

export async function POST(request: Request) {
  try {
    await requireOperatorContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await deletePersonalDataByIdentity(parsed.data);
  return NextResponse.json({ ok: true, result });
}
