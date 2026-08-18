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

        <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2">
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Website Plan</CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold text-foreground">$299</span>
                <span className="text-muted-foreground">/month</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>&bull; AI-built multi-page website</li>
                <li>&bull; Hosted and maintained for you</li>
                <li>&bull; Contact form with instant lead notifications</li>
                <li>&bull; Dashboard to manage everything</li>
                <li>&bull; Cancel anytime</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle>Website + AI Receptionist</CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold text-foreground">$399</span>
                <span className="text-muted-foreground">/month</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>&bull; Everything in Website Plan</li>
                <li>&bull; AI answers your business calls 24/7</li>
                <li>&bull; Takes messages &amp; books appointments</li>
                <li>&bull; Call transcripts in your dashboard</li>
                <li>&bull; Transfers to you when needed</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} LocalPilot AI. All rights reserved.
      </footer>
    </div>
  );
}
