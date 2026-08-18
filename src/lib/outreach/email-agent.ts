/**
 * AI email auto-reply agent (Requirement 4.3, 4.4 / Task 6.6).
 *
 * Given a Prospect's reply to an outreach email, decides whether to
 * auto-reply (confidently, using the Prospect's/Preview Site's data as
 * context) or escalate to a human. Deliberately conservative: the prompt
 * instructs the model to escalate anything it isn't confident about
 * rather than guess, since an overconfident wrong auto-reply to a real
 * prospective customer is worse than a slightly-delayed human reply.
 */

import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, SITE_GENERATION_MODEL } from "@/lib/generation/openai-client";
import { emailAgentResponseSchema, type EmailAgentResponse } from "@/lib/outreach/email-agent-schema";

export type EmailAgentContext = {
  businessName: string;
  previewUrl: string;
  claimUrl: string;
  /** Prior messages in the thread, oldest first. */
  priorMessages: Array<{ direction: "outbound" | "inbound"; body: string }>;
  /** The new inbound message being responded to. */
  incomingMessage: string;
};

const SYSTEM_PROMPT = [
  "You are a customer support assistant for LocalPilot AI, a company that",
  "builds free preview websites for local businesses and offers to host",
  "them for a monthly subscription once claimed. You are replying on",
  "behalf of LocalPilot AI to a business owner (the 'Prospect') who",
  "replied to an outreach email about their free preview site.",
  "",
  "Your job is to decide whether to auto-reply or escalate to a human.",
  "",
  "Auto-reply (action='reply') ONLY if the message is a straightforward",
  "question you can confidently answer using the context given (e.g. 'how",
  "much does it cost', 'how do I claim it', 'can I change the colors',",
  "'is this really free'). Keep replies short, friendly, and helpful.",
  "",
  "Escalate (action='escalate') if the message is a complaint, contains",
  "anger or frustration, asks for a price negotiation or custom deal,",
  "raises a legal/privacy/data concern, asks something you don't have",
  "enough information to answer confidently, or is otherwise ambiguous.",
  "When in doubt, escalate — a delayed human reply is much better than a",
  "wrong automated one.",
  "",
  "Always set confidence between 0 and 1 reflecting how sure you are this",
  "is the right action.",
].join(" ");

export async function runEmailAgent(ctx: EmailAgentContext): Promise<EmailAgentResponse> {
  const openai = getOpenAIClient();

  const contextBlock = [
    `Business name: ${ctx.businessName}`,
    `Preview site: ${ctx.previewUrl}`,
    `Claim link: ${ctx.claimUrl}`,
    "",
    "Prior thread messages:",
    ...ctx.priorMessages.map((m) => `[${m.direction}] ${m.body}`),
    "",
    `New incoming message from the Prospect:\n${ctx.incomingMessage}`,
  ].join("\n");

  const completion = await openai.chat.completions.parse({
    model: SITE_GENERATION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contextBlock },
    ],
    response_format: zodResponseFormat(emailAgentResponseSchema, "email_agent_response"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    throw new Error("Email agent returned no parsed response");
  }

  return parsed;
}
