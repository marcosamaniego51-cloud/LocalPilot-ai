"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BusinessInfo = {
  hours?: Record<string, string>;
  services?: string[];
  phone?: string;
  logoUrl?: string;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function BusinessInfoForm({ initial }: { initial: BusinessInfo }) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<string, string>>(initial.hours ?? {});
  const [servicesText, setServicesText] = useState((initial.services ?? []).join("\n"));
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const services = servicesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/dashboard/site/business-info", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, services, phone, logoUrl }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label>Business hours</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {DAYS.map((day) => (
            <div key={day} className="flex items-center gap-2">
              <span className="w-10 text-sm capitalize text-muted-foreground">{day}</span>
              <Input
                placeholder="9am-5pm or Closed"
                value={hours[day] ?? ""}
                onChange={(e) => setHours((prev) => ({ ...prev, [day]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="services">Services (one per line)</Label>
        <Textarea
          id="services"
          rows={4}
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Business phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input id="logoUrl" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save business info"}
      </Button>
    </form>
  );
}
