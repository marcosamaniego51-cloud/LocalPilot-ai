import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperatorContext, UnauthorizedError } from "@/lib/tenant-context";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * Shared operator/admin shell (Requirement 9.3 / Task 10.1).
 *
 * Task 3.5 already built the `OperatorUser` account type and
 * `requireOperatorContext()` guard (a separate account type from
 * TenantUser, so an operator session can never be mistaken for a Tenant
 * session or vice versa — see that function's doc comment). This layout
 * is the first shared shell across admin pages — until now each admin
 * page (just /admin/discovery) checked the operator context and redirected
 * inline; centralizing it here means new admin pages (10.2/10.3/10.4)
 * automatically get the same gate and the same nav without re-implementing
 * either.
 */
const ADMIN_NAV_ITEMS = [
  { href: "/admin/discovery", label: "Discovery" },
  { href: "/admin/prospects", label: "Prospect Pipeline" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/data-requests", label: "Data Requests" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireOperatorContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw err;
  }

  return (
    <div className="flex flex-1">
      <aside className="hidden w-56 flex-col border-r px-4 py-6 sm:flex">
        <span className="mb-6 px-2 text-lg font-semibold">LocalPilot AI Admin</span>
        <nav className="flex flex-col gap-1">
          {ADMIN_NAV_ITEMS.map((item) => (
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
