/**
 * Outreach email sequence content (Requirement 4.1, 4.2 / Task 6.2).
 *
 * Three emails, increasing urgency, sent at increasing intervals (see
 * outreach-state-machine.ts for the timing). Kept as plain-text templates
 * rather than a CMS/rich-editor system for v1 — simple, reviewable, and
 * easy for the operator to tweak by editing this file directly.
 */

export type OutreachEmailContext = {
  businessName: string;
  previewUrl: string;
  claimUrl: string;
};

export type EmailTemplate = {
  subject: string;
  text: string;
};

export function buildOutreachEmail(step: 0 | 1 | 2, ctx: OutreachEmailContext): EmailTemplate {
  switch (step) {
    case 0:
      return {
        subject: `We built ${ctx.businessName} a free website`,
        text: [
          `Hi there,`,
          `I noticed ${ctx.businessName} doesn't have a website yet, so we went ahead and built you one — for free, no strings attached.`,
          `Take a look: ${ctx.previewUrl}`,
          `If you like it, you can claim it and go live in a couple of minutes: ${ctx.claimUrl}`,
          `Questions? Just reply to this email.`,
        ].join("\n\n"),
      };
    case 1:
      return {
        subject: `Still there? Your free site for ${ctx.businessName}`,
        text: [
          `Hi again,`,
          `Just following up — your free preview website for ${ctx.businessName} is still ready and waiting: ${ctx.previewUrl}`,
          `A lot of your customers are searching for businesses like yours online right now. Claiming your site takes about 2 minutes: ${ctx.claimUrl}`,
          `Happy to answer any questions — just reply here.`,
        ].join("\n\n"),
      };
    case 2:
      return {
        subject: `Last note about your free website`,
        text: [
          `Hi,`,
          `This is the last time we'll reach out about this — I don't want to clutter your inbox.`,
          `Your free preview site for ${ctx.businessName} is here if you ever want it: ${ctx.previewUrl}`,
          `Claim it anytime: ${ctx.claimUrl}`,
          `All the best,`,
          `The LocalPilot AI team`,
        ].join("\n\n"),
      };
  }
}
