/**
 * Retell AI API client (Requirement 7.1, 7.2, 7.5 / Task 8.1, 8.2).
 *
 * Retell is used as the voice AI layer on top of Twilio-backed numbers,
 * per design.md's tech stack table — but rather than provisioning a raw
 * Twilio number and wiring a separate SIP trunk ourselves, this uses
 * Retell's own "Create Phone Number" API with `number_provider: "twilio"`,
 * which purchases and manages the underlying Twilio number on Retell's
 * side. This is a simpler integration for an inbound-only receptionist
 * (no SIP trunk config, no separate Twilio webhook wiring) and avoids
 * duplicating telephony plumbing Retell already provides — the tradeoff
 * (documented in design.md) is that the number lives in Retell's system
 * rather than a Twilio account we directly control; if direct Twilio
 * ownership becomes a requirement later, the "elastic SIP trunking"
 * integration path is the documented alternative
 * (https://docs.retellai.com/deploy/twilio).
 *
 * All calls are REST against api.retellai.com. Not exercised against a
 * real RETELL_API_KEY in this sandbox.
 */

const RETELL_API_BASE = "https://api.retellai.com";

function apiKey(): string {
  const key = process.env.RETELL_API_KEY;
  if (!key) throw new Error("RETELL_API_KEY is not configured");
  return key;
}

async function retellRequest<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
  const res = await fetch(`${RETELL_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Retell ${init.method} ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Retell LLM (the agent's "brain": prompt + tools) ──────────────────

// Shape cross-referenced against Retell's public API docs/examples
// (create-retell-llm reference, community custom-function examples) but
// NOT confirmed against a live API response in this sandbox (no
// RETELL_API_KEY available) — verify against a real account before
// relying on the "custom" tool shape specifically, since that one has the
// least official documentation of the three used here.
export type RetellTool =
  | { type: "end_call"; name: string; description?: string }
  | {
      type: "transfer_call";
      name: string;
      description?: string;
      transfer_destination: { type: "predefined"; number: string };
    }
  | {
      type: "custom";
      name: string;
      description: string;
      url: string;
      parameters: Record<string, unknown>;
      speak_during_execution?: boolean;
      speak_after_execution?: boolean;
    };

export async function createRetellLlm(params: {
  generalPrompt: string;
  beginMessage: string;
  tools: RetellTool[];
}): Promise<{ llm_id: string }> {
  return retellRequest("/create-retell-llm", {
    method: "POST",
    body: {
      general_prompt: params.generalPrompt,
      begin_message: params.beginMessage,
      general_tools: params.tools,
      model: "gpt-4.1",
      model_temperature: 0,
    },
  });
}

export async function updateRetellLlm(
  llmId: string,
  params: { generalPrompt?: string; beginMessage?: string; tools?: RetellTool[] },
): Promise<{ llm_id: string }> {
  return retellRequest(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: {
      ...(params.generalPrompt ? { general_prompt: params.generalPrompt } : {}),
      ...(params.beginMessage ? { begin_message: params.beginMessage } : {}),
      ...(params.tools ? { general_tools: params.tools } : {}),
    },
  });
}

// ── Voice Agent (voice/telephony behavior wrapping an LLM) ─────────────

export async function createRetellAgent(params: {
  llmId: string;
  agentName: string;
  webhookUrl: string;
  voiceId?: string;
}): Promise<{ agent_id: string }> {
  return retellRequest("/create-agent", {
    method: "POST",
    body: {
      response_engine: { type: "retell-llm", llm_id: params.llmId },
      agent_name: params.agentName,
      voice_id: params.voiceId ?? "retell-Cimo",
      webhook_url: params.webhookUrl,
      language: "en-US",
    },
  });
}

export async function updateRetellAgent(
  agentId: string,
  params: { webhookUrl?: string },
): Promise<{ agent_id: string }> {
  return retellRequest(`/update-agent/${agentId}`, {
    method: "PATCH",
    body: {
      ...(params.webhookUrl ? { webhook_url: params.webhookUrl } : {}),
    },
  });
}

// ── Phone numbers ───────────────────────────────────────────────────────

export async function createRetellPhoneNumber(params: {
  agentId: string;
  areaCode?: number;
  nickname?: string;
}): Promise<{ phone_number: string }> {
  return retellRequest("/create-phone-number", {
    method: "POST",
    body: {
      number_provider: "twilio",
      area_code: params.areaCode,
      nickname: params.nickname,
      inbound_agents: [{ agent_id: params.agentId, weight: 1 }],
    },
  });
}

export async function updatePhoneNumberAgent(
  phoneNumber: string,
  params: { inboundAgentId: string | null },
): Promise<void> {
  await retellRequest(`/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: "PATCH",
    body: {
      inbound_agents: params.inboundAgentId ? [{ agent_id: params.inboundAgentId, weight: 1 }] : [],
    },
  });
}

/**
 * Disables inbound answering on a number by clearing its inbound agent
 * (Requirement 7.6 — receptionist disablement tied to subscription
 * suspension). A number with no inbound agent falls back to ringing with
 * no answer rather than being deleted — deleting the number would lose
 * it permanently (a different number on restore would confuse the
 * Tenant's customers who've saved/called it before).
 */
export async function disableInboundAgent(phoneNumber: string): Promise<void> {
  await updatePhoneNumberAgent(phoneNumber, { inboundAgentId: null });
}

export async function enableInboundAgent(phoneNumber: string, agentId: string): Promise<void> {
  await updatePhoneNumberAgent(phoneNumber, { inboundAgentId: agentId });
}

// ── Calls ────────────────────────────────────────────────────────────────

export type RetellCall = {
  call_id: string;
  from_number?: string;
  to_number?: string;
  call_status: string;
  duration_ms?: number;
  transcript?: string;
  recording_url?: string;
  disconnection_reason?: string;
  transfer_destination?: string;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
};

export async function getRetellCall(callId: string): Promise<RetellCall> {
  return retellRequest(`/get-call/${callId}`, { method: "GET" });
}
