"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EditRequestSummary = {
  id: string;
  status: "pending" | "applied" | "failed";
  request: { section: string; instructions?: string };
  createdAt: string;
};

const SECTIONS = ["home", "about", "services", "contact"] as const;

export function EditRequestPanel({
  initialRequests,
}: {
  initialRequests: EditRequestSummary[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<string>("home");
  const [instructions, setInstructions] = useState("");
  const [requests, setRequests] = useState(initialRequests);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/dashboard/site/edit-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, instructions: instructions || undefined }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to submit request");
      return;
    }

    const body = await res.json();
    setRequests((prev) => [body.editRequest, ...prev]);
    setInstructions("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Section to rewrite</Label>
          <Select value={section} onValueChange={(value) => value && setSection(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="instructions">
            Anything specific you want changed? (optional)
          </Label>
          <Textarea
            id="instructions"
            rows={3}
            placeholder="e.g. Make it sound more casual, mention we're family-owned"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Requesting..." : "Rewrite this section"}
        </Button>
      </form>

      {requests.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent requests</p>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span className="capitalize">{r.request.section}</span>
                <Badge
                  variant={
                    r.status === "applied"
                      ? "default"
                      : r.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
