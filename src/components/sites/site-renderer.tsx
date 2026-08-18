import type { SiteModel, SitePageModel } from "@/generated/prisma/models";
import type {
  HomePageContent,
  AboutPageContent,
  ServicesPageContent,
  ContactPageContent,
} from "@/lib/generation/schemas";
import { ContactForm } from "@/components/sites/contact-form";

type SiteWithPages = SiteModel & { pages: SitePageModel[] };

function findPage<T>(site: SiteWithPages, pageType: string): T | undefined {
  return site.pages.find((p: SitePageModel) => p.pageType === pageType)?.content as T | undefined;
}

// Shared renderer for a Tenant/Prospect's generated site (Requirements
// 2.2, 3.1). Renders all four AI-generated pages (Task 4) as sections of a
// single scrollable page for v1 — simplest possible navigation model for a
// small local-business site; can be split into real sub-routes later if a
// Tenant's site grows beyond this.
export function SiteRenderer({ site }: { site: SiteWithPages }) {
  const home = findPage<HomePageContent>(site, "home");
  const about = findPage<AboutPageContent>(site, "about");
  const services = findPage<ServicesPageContent>(site, "services");
  const contact = findPage<ContactPageContent>(site, "contact");

  const colorScheme = site.colorScheme as
    | { primary?: string; secondary?: string; accent?: string }
    | null;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        colorScheme?.primary
          ? ({ "--site-primary": colorScheme.primary } as React.CSSProperties)
          : undefined
      }
    >
      {site.status === "preview" ? <PreviewBanner siteId={site.id} /> : null}

      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold">{site.slug.replace(/-/g, " ")}</span>
        <nav className="hidden gap-6 text-sm font-medium text-muted-foreground sm:flex">
          <a href="#about">About</a>
          <a href="#services">Services</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main className="flex-1">
        <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
            {home?.headline ?? "Your business, online."}
          </h1>
          {home?.subheadline ? (
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              {home.subheadline}
            </p>
          ) : null}
          {home?.body ? (
            <p className="mt-6 max-w-2xl text-muted-foreground">{home.body}</p>
          ) : null}
          {home?.ctaLabel ? (
            <a
              href="#contact"
              className="mt-8 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              {home.ctaLabel}
            </a>
          ) : null}
        </section>

        {about ? (
          <section id="about" className="border-t px-6 py-16">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-semibold">{about.headline}</h2>
              <p className="mt-4 text-muted-foreground">{about.body}</p>
              {about.highlights?.length ? (
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {about.highlights.map((h, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      &bull; {h}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {services ? (
          <section id="services" className="border-t bg-muted/30 px-6 py-16">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-semibold">{services.headline}</h2>
              <p className="mt-4 text-muted-foreground">{services.intro}</p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {services.services?.map((s, i) => (
                  <li key={i} className="rounded-md border p-4">
                    <p className="font-medium">{s.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {contact ? (
          <section id="contact" className="border-t px-6 py-16">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-semibold">{contact.headline}</h2>
              <p className="mt-4 text-muted-foreground">{contact.body}</p>
              <div className="mt-8">
                {site.status === "published" ? (
                  <ContactForm siteId={site.id} submitLabel={contact.formLabel} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This business hasn&apos;t claimed their site yet, so
                    messages can&apos;t be sent here. Claim this site above
                    to enable a working contact form.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        Powered by LocalPilot AI
      </footer>
    </div>
  );
}

function PreviewBanner({ siteId }: { siteId: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-primary px-6 py-3 text-sm text-primary-foreground">
      <span>This is a free preview site built for this business.</span>
      <a
        href={`/claim/${siteId}`}
        className="font-medium underline underline-offset-2"
      >
        Claim this site &rarr;
      </a>
    </div>
  );
}
