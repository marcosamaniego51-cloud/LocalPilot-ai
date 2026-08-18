/**
 * Receptionist provisioning (Requirement 7.1, 7.5 / Task 8.1, 8.2).
 *
 * Called once per Tenant, right after claim (Requirement 7.1: "When a
 * Tenant subscribes THEN the system SHALL provision a dedicated phone
 * number"). Creates:
 *   1. A ReceptionistConfig row (defaults derived from the business name;
 *      the Tenant can edit hours/FAQs/personal number later via the
 *      dashboard — Task 9.6 — which calls updateReceptionistAgent below).
 *   2. A Retell LLM (the agent's prompt + tools).
 *   3. A Retell Agent wrapping that LLM, with its webhook_url pointed at
 *      this app's call-lifecycle receiver (Task 8.5).
 *   4. A Retell-managed phone number bound to that agent for inbound
 *      calls.
 *
 * Deliberately does NOT throw on Retell API failure when called from the
 * claim webhook path — a Stripe webhook failure would trigger a full
 * Stripe retry, which is wasteful once the Tenant/Subscription/Site are
 * already correctly created (completeClaimFromCheckout is idempotent and
 * would just re-detect "already claimed" and return early on retry,
 * never actually retrying the failed Retell call). Failures are
 * audit-logged instead so they're visible without blocking the rest of
 * the claim flow; a Tenant with a site but no receptionist yet still has
 * a fully working dashboard/website.
 */

import { prisma } from "@/lib/prisma";
import {
  createRetellLlm,
  createRetellAgent,
  createRetellPhoneNumber,
  updateRetellLlm,
} from "@/lib/voice/retell-client";
import {
  buildReceptionistPrompt,
  buildReceptionistGreeting,
  buildReceptionistTools,
  type ReceptionistBusinessInfo,
} from "@/lib/voice/receptionist-prompt";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localpilot.ai";
}

async function getBusinessInfo(tenantId: string): Promise<ReceptionistBusinessInfo> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { receptionistConfig: true, site: true },
  });

  const siteBusinessInfo = (tenant.site?.businessInfo ?? {}) as {
    services?: string[];
  };

  return {
    businessName: tenant.businessName,
    hours: tenant.receptionistConfig?.businessHours as Record<string, string> | null,
    services: siteBusinessInfo.services ?? null,
    faqs: tenant.receptionistConfig?.faqs as Array<{ question: string; answer: string }> | null,
    personalNumber: tenant.receptionistConfig?.personalNumber ?? tenant.forwardingNumber,
    greeting: tenant.receptionistConfig?.greeting,
  };
}

export async function provisionReceptionistForTenant(tenantId: string): Promise<void> {
  // Lean-launch mode: if RETELL_API_KEY isn't configured, skip
  // receptionist provisioning entirely — the Tenant still gets a fully
  // working website + dashboard + lead notifications, just no AI phone
  // answering. This is the expected state when running on the $0 stack
  // (no Retell account), and is not an error condition.
  if (!process.env.RETELL_API_KEY) {
    return;
  }

  const existing = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (existing.retellAgentId && existing.receptionistPhoneNumber) {
    return; // already provisioned — idempotent
  }

  await prisma.receptionistConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });

  const info = await getBusinessInfo(tenantId);
  const toolWebhookUrl = `${appUrl()}/api/webhooks/voice/tool`;

  const { llm_id } = await createRetellLlm({
    generalPrompt: buildReceptionistPrompt(info),
    beginMessage: buildReceptionistGreeting(info),
    tools: buildReceptionistTools({ info, toolWebhookUrl }),
  });

  const { agent_id } = await createRetellAgent({
    llmId: llm_id,
    agentName: `${info.businessName} Receptionist`,
    // Agent-level webhook_url receives call_started/call_ended/
    // call_analyzed lifecycle events (Task 8.5) — distinct from Retell's
    // separate per-number "inbound call webhook" (pre-call agent
    // routing/rejection), which isn't needed here since each Tenant's
    // number already has its own agent bound directly at creation time.
    webhookUrl: `${appUrl()}/api/webhooks/voice/call-events`,
  });

  const { phone_number } = await createRetellPhoneNumber({
    agentId: agent_id,
    nickname: `${info.businessName} Front Desk`,
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      retellLlmId: llm_id,
      retellAgentId: agent_id,
      receptionistPhoneNumber: phone_number,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "system:voice-provisioning",
      action: "receptionist_provisioned",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { llmId: llm_id, agentId: agent_id, phoneNumber: phone_number },
    },
  });
}

/**
 * Re-pushes the receptionist's prompt/tools to Retell after the Tenant
 * edits their business info (hours, FAQs, personal number) in the
 * dashboard (Requirement 7.5 / Task 9.6's Site Editor calls this). No-op
 * if the Tenant has no receptionist provisioned yet.
 */
export async function updateReceptionistAgent(tenantId: string): Promise<void> {
  if (!process.env.RETELL_API_KEY) return; // lean-launch: no Retell configured

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!tenant.retellLlmId) return;

  const info = await getBusinessInfo(tenantId);
  const toolWebhookUrl = `${appUrl()}/api/webhooks/voice/tool`;

  await updateRetellLlm(tenant.retellLlmId, {
    generalPrompt: buildReceptionistPrompt(info),
    beginMessage: buildReceptionistGreeting(info),
    tools: buildReceptionistTools({ info, toolWebhookUrl }),
  });
}
