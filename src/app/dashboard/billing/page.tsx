import { requireTenantOwner, UnauthorizedError } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManageBillingButton } from "./manage-billing-button";

// Billing page (Requirement 6.1 / Task 9.7): shows subscription status
// and links out to Stripe's hosted Customer Portal for everything else
// (payment method, invoices, cancellation) — no custom billing UI needed
// beyond this page. Owner-only (Requirement 9.4 / Task 9.8) — staff
// shouldn't be able to view or manage billing.
export default async function BillingPage() {
  let tenantId: string;
  try {
    ({ tenantId } = await requireTenantOwner());
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Only the account owner can view billing. Ask the business
            owner if you need something here.
          </p>
        </div>
      );
    }
    throw err;
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={subscription?.status === "active" ? "default" : "secondary"}>
              {subscription?.status ?? "none"}
            </Badge>
          </div>
          {subscription?.currentPeriodEnd ? (
            <p className="text-sm text-muted-foreground">
              Current period ends {subscription.currentPeriodEnd.toLocaleDateString()}.
            </p>
          ) : null}
          {subscription?.status === "past_due" || subscription?.status === "suspended" ? (
            <p className="text-sm text-destructive">
              There&apos;s an issue with your payment. Update your payment
              method to restore your site and AI receptionist.
            </p>
          ) : null}
          <ManageBillingButton />
        </CardContent>
      </Card>
    </div>
  );
}
