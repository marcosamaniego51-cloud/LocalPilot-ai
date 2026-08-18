"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DataRequestForm() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    const res = await fetch("/api/admin/data-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || undefined,
        phone: phone || undefined,
      }),
    });

    setSubmitting(false);

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Failed to process request");
      return;
    }

    setResult(
      `Deleted ${body.result.prospectsDeleted} prospect(s), ${body.result.tenantsDeleted} tenant(s). Redacted ${body.result.auditLogsRedacted} audit log entries.`,
    );
    setEmail("");
    setPhone("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Permanently deletes the Prospect/Tenant record(s) matching this
        identity, and disassociates (but does not delete) their call/email
        history. This cannot be undone.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
      <Button type="submit" variant="destructive" disabled={submitting}>
        {submitting ? "Deleting..." : "Delete personal data"}
      </Button>
    </form>
  );
}
