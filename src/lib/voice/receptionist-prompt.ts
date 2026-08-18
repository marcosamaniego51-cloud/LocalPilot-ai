/**
 * Receptionist agent prompt + tool configuration (Requirement 7.2, 7.4,
 * 7.5 / Task 8.2, 8.3, 8.4).
 *
 * Builds the general_prompt and general_tools sent to Retell for a
 * Tenant's inbound AI receptionist, from that Tenant's business info
 * (hours, services, FAQs) and receptionist config (personal number,
 * greeting). Regenerated and pushed to Retell (via updateRetellLlm)
 * whenever the Tenant edits their business info in the dashboard, so the
 * agent always answers with current information (Requirement 7.5).
 */

import type { RetellTool } from "@/lib/voice/retell-client";

export type ReceptionistBusinessInfo = {
  businessName: string;
  hours?: Record<string, string> | null;
  services?: string[] | null;
  faqs?: Array<{ question: string; answer: string }> | null;
  personalNumber?: string | null;
  greeting?: string | null;
};

const TAKE_MESSAGE_TOOL_NAME = "take_message";
const REQUEST_APPOINTMENT_TOOL_NAME = "request_appointment";

export function buildReceptionistPrompt(info: ReceptionistBusinessInfo): string {
  const hoursBlock = info.hours
    ? Object.entries(info.hours)
        .map(([day, hours]) => `${day}: ${hours}`)
        .join("\n")
    : "Hours not provided — if asked, say you're not sure and offer to take a message.";

  const servicesBlock = info.services?.length
    ? info.services.join(", ")
    : "No specific services listed — answer generally and offer to take a message for anything specific.";

  const faqBlock = info.faqs?.length
    ? info.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "No FAQs configured.";

  return [
    `You are the AI receptionist for ${info.businessName}, answering their business phone line.`,
    "Be warm, brief, and professional — this is a phone call, not a chat, so keep sentences short and speak naturally.",
    "",
    `Business hours:\n${hoursBlock}`,
    "",
    `Services offered: ${servicesBlock}`,
    "",
    `Frequently asked questions:\n${faqBlock}`,
    "",
    "Your job, in order of priority:",
    "1. Answer questions using the business hours, services, and FAQs above.",
    `2. If the caller wants to book or request an appointment, use the ${REQUEST_APPOINTMENT_TOOL_NAME} tool to capture their name, phone number, and what they need — do not promise a specific time slot yourself, just say the business will confirm.`,
    "3. If you cannot confidently answer the caller's question, or they ask for something you don't have information about, use the take_message tool to record their name, phone number, and message, then let them know the business will get back to them.",
    "4. If the caller is upset, has an urgent issue, or explicitly asks for a person, and a transfer number is available, transfer the call.",
    "Never make up information you don't have (prices, specific availability, policies) — offer to take a message instead of guessing.",
  ].join("\n");
}

export function buildReceptionistGreeting(info: ReceptionistBusinessInfo): string {
  return info.greeting ?? `Thanks for calling ${info.businessName}, how can I help you today?`;
}

/**
 * Tool list for the receptionist agent (Requirement 7.2, 7.4 / Task 8.3,
 * 8.4). take_message and request_appointment are custom tools pointed
 * back at this app's mid-call webhook (Task 8.3's intent-handling
 * endpoint); transfer_call is only included when a personal number is
 * configured (Requirement 7.4's fallback), since Retell requires a real
 * destination number on that tool type.
 */
export function buildReceptionistTools(params: {
  info: ReceptionistBusinessInfo;
  toolWebhookUrl: string;
}): RetellTool[] {
  const tools: RetellTool[] = [
    {
      type: "custom",
      name: TAKE_MESSAGE_TOOL_NAME,
      description:
        "Records a message from the caller when you can't confidently answer their question. Call this with the caller's name, phone number, and their message.",
      url: params.toolWebhookUrl,
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "The caller's name" },
          caller_phone: { type: "string", description: "The caller's phone number, if given; otherwise use the caller ID" },
          message: { type: "string", description: "What the caller wants relayed to the business" },
        },
        required: ["message"],
      },
      speak_during_execution: false,
      speak_after_execution: true,
    },
    {
      type: "custom",
      name: REQUEST_APPOINTMENT_TOOL_NAME,
      description:
        "Records an appointment request from the caller. Call this once you have their name, phone number, and what they'd like to book.",
      url: params.toolWebhookUrl,
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string", description: "The caller's name" },
          caller_phone: { type: "string", description: "The caller's phone number, if given; otherwise use the caller ID" },
          requested_service: { type: "string", description: "What the caller wants to book" },
          preferred_time: { type: "string", description: "Any time preference the caller mentioned, in their own words" },
        },
        required: ["caller_name", "requested_service"],
      },
      speak_during_execution: false,
      speak_after_execution: true,
    },
    { type: "end_call", name: "end_call", description: "End the call once the caller's request has been handled or they say goodbye." },
  ];

  if (params.info.personalNumber) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_owner",
      description:
        "Transfer the call to the business owner's personal number if the caller is upset, has an urgent issue, or explicitly asks for a person.",
      transfer_destination: { type: "predefined", number: params.info.personalNumber },
    });
  }

  return tools;
}

export { TAKE_MESSAGE_TOOL_NAME, REQUEST_APPOINTMENT_TOOL_NAME };
