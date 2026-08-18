"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddProspectForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    const res = await fetch("/api/admin/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName,
        category,
        phone: phone || undefined,
        email: email || undefined,
        city: city || undefined,
        state: state || undefined,
      }),
    });

    setSubmitting(false);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Failed to create prospect");
      return;
    }

    setResult(`Created! Preview: ${body.previewUrl}`);
    setBusinessName("");
    setCategory("");
    setPhone("");
    setEmail("");
    setCity("");
    setState("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paste a business from Google Maps that doesn&apos;t have a website.
        A preview site will be generated automatically.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="businessName">Business name *</Label>
          <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">Category *</Label>
          <Input id="category" placeholder="plumber, salon, restaurant..." value={category} onChange={(e) => setCategory(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="state">State</Label>
          <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating..." : "Add Prospect + Generate Site"}
      </Button>
    </form>
  );
}
