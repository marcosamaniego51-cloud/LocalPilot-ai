"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Public contact form for a published Tenant site (Requirement 3.5 /
// Task 5.4). Rendered only for published sites — preview sites (Prospects
// who haven't claimed yet) show a "coming soon" note instead, since
// there's no Tenant on the other end yet to receive the message.
export function ContactForm({ siteId, submitLabel }: { siteId: string; submitLabel?: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await fetch(`/api/sites/${siteId}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        message: formData.get("message"),
      }),
    });

    if (res.ok) {
      setStatus("sent");
      form.reset();
    } else {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        Thanks — your message has been sent. We&apos;ll be in touch soon.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto grid max-w-md gap-4 text-left">
      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required rows={4} />
      </div>
      {status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          Something went wrong sending your message. Please try again.
        </p>
      ) : null}
      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending..." : submitLabel ?? "Send message"}
      </Button>
    </form>
  );
}
