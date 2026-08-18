import { SetPasswordForm } from "./set-password-form";

// "Set your password" landing page (Task 7.3) — linked from the welcome
// email a Tenant receives right after claiming their site.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-semibold">Invalid link</h1>
        <p className="text-muted-foreground">This link is missing its token.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a password to access your LocalPilot AI dashboard.
          </p>
        </div>
        <SetPasswordForm token={token} />
      </div>
    </div>
  );
}
