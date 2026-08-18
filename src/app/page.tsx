import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function MarketingHome() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold">LocalPilot AI</span>
        <nav className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-24 text-center">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            A website, a receptionist, and new customers — on autopilot.
          </h1>
          <p className="text-lg text-muted-foreground">
            LocalPilot AI builds your business a professional website, answers
            your customer calls with AI, and handles it all for one monthly
            subscription. No web designer, no missed calls.
          </p>
        </div>

        <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>AI-Built Website</CardTitle>
              <CardDescription>
                A multi-page site generated and hosted for your business,
                ready in minutes.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI Receptionist</CardTitle>
              <CardDescription>
                Never miss a call — an AI agent answers, takes messages, and
                books appointments.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>One Monthly Plan</CardTitle>
              <CardDescription>
                Everything included for a single subscription. Cancel
                anytime.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </div>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} LocalPilot AI. All rights reserved.
      </footer>
    </div>
  );
}
