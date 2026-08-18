"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Faq = { question: string; answer: string };

type Initial = {
  businessHours: Record<string, string>;
  faqs: Faq[];
  personalNumber: string;
  greeting: string;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function ReceptionistConfigForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<string, string>>(initial.businessHours);
  const [faqs, setFaqs] = useState<Faq[]>(initial.faqs.length ? initial.faqs : [{ question: "", answer: "" }]);
  const [personalNumber, setPersonalNumber] = useState(initial.personalNumber);
  const [greeting, setGreeting] = useState(initial.greeting);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateFaq(index: number, field: keyof Faq, value: string) {
    setFaqs((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const res = await fetch("/api/dashboard/receptionist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessHours: hours,
        faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
        personalNumber: personalNumber || null,
        greeting: greeting || null,
      }),
    });

    setSaving(false);

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Failed to save");
      return;
    }

    setMessage(body.warning ?? "Saved. Your AI receptionist is up to date.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
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
        <Label htmlFor="greeting">Greeting</Label>
        <Input
          id="greeting"
          placeholder="Thanks for calling [Business], how can I help you today?"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="personalNumber">
          Personal number to transfer to (optional)
        </Label>
        <Input
          id="personalNumber"
          type="tel"
          placeholder="+15555550100"
          value={personalNumber}
          onChange={(e) => setPersonalNumber(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <Label>Frequently asked questions</Label>
        {faqs.map((faq, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <Input
              placeholder="Question"
              value={faq.question}
              onChange={(e) => updateFaq(i, "question", e.target.value)}
            />
            <Textarea
              placeholder="Answer"
              rows={2}
              value={faq.answer}
              onChange={(e) => updateFaq(i, "answer", e.target.value)}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFaqs((prev) => [...prev, { question: "", answer: "" }])}
        >
          Add another FAQ
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
