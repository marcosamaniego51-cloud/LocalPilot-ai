"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleClick() {
    setState("submitting");
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setState(res.ok ? "done" : "error");
  }

  if (state === "done") {
    return (
      <p className="text-muted-foreground">
        You won&apos;t receive any further emails from us about this.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button onClick={handleClick} disabled={state === "submitting"}>
        {state === "submitting" ? "Unsubscribing..." : "Confirm unsubscribe"}
      </Button>
      {state === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          Something went wrong. Please try again, or reply to any of our
          emails and we&apos;ll remove you manually.
        </p>
      ) : null}
    </div>
  );
}
