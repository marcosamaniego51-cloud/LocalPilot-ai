import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/calls", label: "Call Logs" },
  { href: "/dashboard/emails", label: "Emails" },
  { href: "/dashboard/site", label: "Site Editor" },
  { href: "/dashboard/receptionist", label: "AI Receptionist" },
  { href: "/dashboard/billing", label: "Billing", ownerOnly: true },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Role-based nav filtering (Requirement 9.4 / Task 9.8) — staff users
  // don't see owner-only sections like Billing. This is a UX convenience,
  // not the actual enforcement boundary: the owner-only pages/routes
  // themselves check the role server-side too (see
  // src/app/dashboard/billing/page.tsx), since hiding a nav link alone
  // would not stop a staff user from navigating to the URL directly.
  const role = (session.user as { role?: string }).role;
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");

  return (
    <div className="flex flex-1">
      <aside className="hidden w-56 flex-col border-r px-4 py-6 sm:flex">
        <span className="mb-6 px-2 text-lg font-semibold">LocalPilot AI</span>
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="mt-auto"
        >
          <Button variant="outline" className="w-full" type="submit">
            Log out
          </Button>
        </form>
      </aside>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
