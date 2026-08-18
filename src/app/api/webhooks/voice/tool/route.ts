import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRetellSignature } from "@/lib/voice/verify-retell-signature";
import { TAKE_MESSAGE_TOOL_NAME, REQUEST_APPOINTMENT_TOOL_NAME } from "@/lib/voice/receptionist-prompt";

/**
 * Mid-call custom-tool webhook (Requirement 7.2, 7.3 / Task 8.3).
 *
 * Retell POSTs here when the receptionist agent invokes take_message or
 * request_appointment (see receptionist-prompt.ts). Per Retell's custom
 * function docs, the request body is `{ name, args, call: {...} }` — this
 * creates a Lead immediately (rather than waiting for call_ended/
 * call_analyzed, Task 8.5) since the tool call itself is the moment the
 * agent has decided this caller needs to be captured as a Lead, and doing
 * it here means the Tenant sees it in their dashboard in real time during
 * the call rather than only after it ends.
 *
 * The corresponding Call row (with transcript/duration/outcome) is still
 * created by the call_ended/call_analyzed handler once the call
 * finishes — this route only needs to hand back a short string for the
 * agent to read back to the caller, and create the Lead.
 */

type RetellCustomFunctionRequest = {
  name: string;
  args: Record<string, unknown>;
  call: {
    call_id: string;
    from_number?: string;
    to_number?: string;
    metadata?: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyRetellSignature(rawBody, request.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as RetellCustomFunctionRequest;

  const tenant = await prisma.tenant.findFirst({
    where: { receptionistPhoneNumber: body.call.to_number },
  });

  if (!tenant) {
    // No Tenant owns this number (e.g. stale/removed) — respond gracefully
    // rather than erroring, since the call is live and the agent needs
    // *some* response to keep going.
    return NextResponse.json("Sorry, I wasn't able to save that just now.");
  }

  if (body.name === TAKE_MESSAGE_TOOL_NAME) {
    await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        source: "inbound_call",
        name: typeof body.args.caller_name === "string" ? body.args.caller_name : undefined,
        phone:
          typeof body.args.caller_phone === "string" && body.args.caller_phone
            ? body.args.caller_phone
            : body.call.from_number,
        message: typeof body.args.message === "string" ? body.args.message : undefined,
      },
    });
    return NextResponse.json("Got it, I've noted that down for the team.");
  }

  if (body.name === REQUEST_APPOINTMENT_TOOL_NAME) {
    const parts = [
      body.args.requested_service ? `Wants: ${body.args.requested_service}` : null,
      body.args.preferred_time ? `Preferred time: ${body.args.preferred_time}` : null,
    ].filter(Boolean);

    await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        source: "inbound_call",
        name: typeof body.args.caller_name === "string" ? body.args.caller_name : undefined,
        phone:
          typeof body.args.caller_phone === "string" && body.args.caller_phone
            ? body.args.caller_phone
            : body.call.from_number,
        message: parts.length ? `Appointment request — ${parts.join(", ")}` : "Appointment request",
      },
    });
    return NextResponse.json("Great, I've passed along your appointment request.");
  }

  return NextResponse.json(`Unknown tool: ${body.name}`, { status: 400 });
}
