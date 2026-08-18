import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOperatorContext, UnauthorizedError } from "@/lib/tenant-context";
import { normalizeBusinessName } from "@/lib/discovery/dedup";
import { normalizePhone } from "@/lib/discovery/dedup";
import { siteGenerationQueue, safeEnqueue } from "@/lib/queues";
import { generateUniqueSlug } from "@/lib/sites/slug";
import { selectTemplateForCategory } from "@/lib/generation/templates";

/**
 * Manual Prospect creation (lean-launch / Task: add manual prospect flow).
 *
 * Lets the operator paste a business's info from Google Maps directly
 * into the admin panel, without needing a GOOGLE_PLACES_API_KEY or the
 * automated discovery engine running. Creates a Prospect + a skeleton
 * preview Site (using the template selector but without AI-generated
 * content yet — that happens via the site-generation queue if the worker
 * is running, or can be triggered manually later). This is the "find 10
 * businesses on Google Maps yourself" path from the lean-launch plan.
 */

const createProspectSchema = z.object({
  businessName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
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
  const parsed = createProspectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { businessName, category, phone, email, address, city, state } = parsed.data;
  const normalizedName = normalizeBusinessName(businessName);
  const normalizedPhoneVal = normalizePhone(phone);

  // Check for duplicates (same logic as the automated discovery engine)
  const existingByPhone = normalizedPhoneVal
    ? await prisma.prospect.findFirst({ where: { normalizedPhone: normalizedPhoneVal } })
    : null;
  const existingByName = await prisma.prospect.findFirst({
    where: { normalizedBusinessName: normalizedName },
  });

  if (existingByPhone || existingByName) {
    return NextResponse.json(
      { error: "A Prospect with this phone or business name already exists", existingId: existingByPhone?.id ?? existingByName?.id },
      { status: 409 },
    );
  }

  const prospect = await prisma.prospect.create({
    data: {
      businessName,
      normalizedBusinessName: normalizedName,
      category,
      phone: phone || undefined,
      normalizedPhone: normalizedPhoneVal,
      email: email || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      source: "manual",
      status: "new",
    },
  });

  // Create a skeleton preview site immediately (so the operator can
  // share a preview link right away even if the worker/OpenAI isn't
  // running yet). Uses the template selector for styling but fills
  // placeholder content. If the worker IS running and OPENAI_API_KEY is
  // set, the enqueued generation job will replace this with real AI copy.
  const template = selectTemplateForCategory(category);
  const subdomain = await generateUniqueSlug(businessName);

  const site = await prisma.site.create({
    data: {
      prospectId: prospect.id,
      slug: subdomain,
      subdomain,
      status: "preview",
      templateId: template.id,
      colorScheme: template.colorScheme,
      generatedAt: new Date(),
      pages: {
        create: [
          {
            pageType: "home",
            content: {
              headline: `${businessName} — Your Local ${category.charAt(0).toUpperCase() + category.slice(1)}`,
              subheadline: [city, state].filter(Boolean).join(", ") || "Serving your community",
              body: "A professional website is being prepared for this business.",
              ctaLabel: "Get in touch",
            },
          },
          { pageType: "about", content: { headline: `About ${businessName}`, body: "More details coming soon.", highlights: [] } },
          { pageType: "services", content: { headline: "Our Services", intro: "Services offered by this business.", services: [{ name: category, description: "Contact us for details." }] } },
          { pageType: "contact", content: { headline: "Contact Us", body: "Reach out — we'd love to hear from you.", formLabel: "Send message" } },
        ],
      },
    },
  });

  // Update Prospect status to reflect it has a preview site now
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { status: "previewed" },
  });

  // Enqueue AI content generation (will no-op gracefully if Redis/worker
  // isn't running — the placeholder content above is already viewable)
  await safeEnqueue(siteGenerationQueue, "generate", { prospectId: prospect.id });

  return NextResponse.json(
    {
      prospect,
      site: { id: site.id, subdomain: site.subdomain },
      previewUrl: `https://${site.subdomain}.${(process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost:3000").split(":")[0]}`,
    },
    { status: 201 },
  );
}
