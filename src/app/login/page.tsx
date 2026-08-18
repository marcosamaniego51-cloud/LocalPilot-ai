import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Log in to LocalPilot AI</h1>
          <p className="text-sm text-muted-foreground">
            Access your dashboard, leads, and call logs.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
