"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ClaimButton({ prospectId }: { prospectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/claim/${prospectId}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setError(body.error ?? "Something went wrong starting checkout");
      return;
    }

    window.location.href = body.checkoutUrl;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" onClick={handleClaim} disabled={loading}>
        {loading ? "Redirecting to checkout..." : "Claim this site"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
