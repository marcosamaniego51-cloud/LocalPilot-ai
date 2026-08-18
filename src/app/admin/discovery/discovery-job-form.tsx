"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DiscoveryJobForm() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/discovery-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        location,
        radiusKm: Number(radiusKm),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start discovery job");
      return;
    }

    setCategory("");
    setLocation("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="category">Category</Label>
        <Input
          id="category"
          placeholder="plumber"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="Austin, TX"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          className="w-48"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="radiusKm">Radius (km)</Label>
        <Input
          id="radiusKm"
          type="number"
          min={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(e.target.value)}
          className="w-24"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Starting..." : "Run discovery"}
      </Button>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
