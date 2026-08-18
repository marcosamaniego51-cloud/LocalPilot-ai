import type { SiteModel, SitePageModel } from "@/generated/prisma/models";

type SiteWithPages = SiteModel & { pages: SitePageModel[] };

type HomePageContent = {
  headline?: string;
  subheadline?: string;
  body?: string;
};

// Shared renderer for a Tenant/Prospect's generated site (Requirement 3.1,
// 2.2). Content shape is intentionally loose (Json in the DB) since the AI
// generation step (Task 4) determines the actual block structure per page;
// this renders a minimal, safe fallback for whatever's present today and
// will grow richer block types as generation is implemented.
export function SiteRenderer({ site }: { site: SiteWithPages }) {
  const homePage = site.pages.find((p: SitePageModel) => p.pageType === "home");
  const home = (homePage?.content ?? {}) as HomePageContent;

  return (
    <div className="flex min-h-screen flex-col">
      {site.status === "preview" ? <PreviewBanner siteId={site.id} /> : null}

      <header className="border-b px-6 py-4">
        <span className="text-lg font-semibold">{site.slug}</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          {home.headline ?? "Your business, online."}
        </h1>
        {home.subheadline ? (
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            {home.subheadline}
          </p>
        ) : null}
        {home.body ? (
          <p className="mt-6 max-w-2xl text-muted-foreground">{home.body}</p>
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
