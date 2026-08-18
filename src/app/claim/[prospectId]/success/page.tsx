import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

// Post-Checkout landing page (Requirement 6.2 / Task 7.1). The actual
// Tenant/Subscription creation happens asynchronously via the
// checkout.session.completed webhook (src/app/api/webhooks/stripe/route.ts),
// NOT on this page load — Stripe's webhook is the source of truth for
// "did payment actually succeed," since a user could land here from a
// stale/replayed URL, and client-side redirects are not a reliable
// payment-confirmation signal. This page just polls-by-refresh: if the
// webhook has landed by the time the Tenant loads their dashboard, great;
// if not, the message below sets the right expectation.
export default async function ClaimSuccessPage({
  params,
}: {
  params: Promise<{ prospectId: string }>;
}) {
  const { prospectId } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { prospectId } });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">
        {tenant ? "You're all set!" : "Payment received — finishing setup..."}
      </h1>
      <p className="max-w-md text-muted-foreground">
        {tenant
          ? "Your site is now live and your account is ready."
          : "This usually takes just a few seconds. Refresh this page in a moment, or check your email for a confirmation."}
      </p>
      {tenant ? (
        <Link href="/dashboard">
          <Button>Go to your dashboard</Button>
        </Link>
      ) : null}
    </div>
  );
}
