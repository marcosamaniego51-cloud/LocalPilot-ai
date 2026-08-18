import { z } from "zod";

/**
 * Structured output schema for the AI email auto-reply agent (Requirement
 * 4.3, 4.4 / Task 6.6).
 *
 * The model must choose exactly one action per inbound message:
 *   - "reply": confident enough to send an automated response
 *   - "escalate": ambiguous intent, a complaint, a legal/pricing
 *     negotiation, or anything else the model isn't confident handling
 *     autonomously — routed to a human instead of auto-replied to.
 *
 * confidence is 0-1 and persisted on the EmailMessage row regardless of
 * which action was chosen, for later tuning/auditing of the escalation
 * threshold.
 */
export const emailAgentResponseSchema = z.object({
  action: z.enum(["reply", "escalate"]),
  confidence: z.number().min(0).max(1),
  replyBody: z
    .string()
    .nullable()
    .describe("The reply text to send, if action is 'reply'. Null if action is 'escalate'."),
  escalationReason: z
    .string()
    .nullable()
    .describe("Why this needs human review, if action is 'escalate'. Null if action is 'reply'."),
});

export type EmailAgentResponse = z.infer<typeof emailAgentResponseSchema>;
