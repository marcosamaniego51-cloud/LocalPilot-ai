import { verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe-token";
import { UnsubscribeButton } from "./unsubscribe-button";

// Public unsubscribe landing page (Requirement 4.5, 10.1 / Task 6.4).
// Linked from every outreach email's footer. This page only *validates*
// the token and shows a confirm button — the actual unsubscribe happens
// on a user-initiated POST to /api/unsubscribe (see that route's comment
// for why this isn't a bare-GET auto-unsubscribe: email security scanners
// pre-fetch links in emails, which would otherwise trigger false
// unsubscribes).
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const prospectId = token ? verifyUnsubscribeToken(token) : null;

  if (!prospectId || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-semibold">Invalid unsubscribe link</h1>
        <p className="text-muted-foreground">
          This link is invalid or has expired. If you continue to receive
          emails you don&apos;t want, please reply directly to any of our
          messages and we&apos;ll remove you manually.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Unsubscribe</h1>
      <p className="max-w-md text-muted-foreground">
        Click below to confirm you&apos;d like to stop receiving emails from
        us about this.
      </p>
      <UnsubscribeButton token={token} />
    </div>
  );
}
