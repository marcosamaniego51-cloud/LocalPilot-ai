"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type CustomDomainSummary = {
  id: string;
  domain: string;
  verified: boolean;
  verificationToken: string;
};

// Minimal custom-domain connection UI (Requirement 3.4 / Task 5.5). A
// fuller Site Editor experience (business info form, edit requests, etc.)
// is Task 9.6 — this component covers just the domain-connection slice so
// the flow has a real entry point end-to-end today.
export function CustomDomainPanel({
  initialDomains,
}: {
  initialDomains: CustomDomainSummary[];
}) {
  const router = useRouter();
  const [domains, setDomains] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/dashboard/site/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to connect domain");
      return;
    }

    const body = await res.json();
    setDomains((prev) => [...prev, body.customDomain]);
    setNewDomain("");
    router.refresh();
  }

  async function handleVerify(domainId: string) {
    setError(null);
    const res = await fetch(`/api/dashboard/site/domains/${domainId}/verify`, {
      method: "POST",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Verification failed — has the DNS record propagated yet?");
      return;
    }

    const body = await res.json();
    setDomains((prev) => prev.map((d) => (d.id === domainId ? body.customDomain : d)));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleConnect} className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-domain">Connect a custom domain</Label>
          <Input
            id="new-domain"
            placeholder="www.yourbusiness.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Connecting..." : "Connect"}
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {domains.map((d) => (
          <li key={d.id} className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{d.domain}</span>
              <Badge variant={d.verified ? "default" : "secondary"}>
                {d.verified ? "Verified" : "Pending verification"}
              </Badge>
            </div>
            {!d.verified ? (
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>Add this DNS TXT record, then click Verify:</p>
                <code className="block rounded bg-muted p-2 text-xs">
                  _localpilot-verify.{d.domain} TXT &quot;{d.verificationToken}&quot;
                </code>
                <Button size="sm" variant="outline" onClick={() => handleVerify(d.id)}>
                  Verify
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
