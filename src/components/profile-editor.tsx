"use client";

import { useState, useTransition } from "react";
import { saveProfileAction } from "@/lib/actions";
import type { Profile } from "@/lib/ai/schemas";
import { Button, Input, Label, Notice, Select, Textarea } from "./ui";

function nextId(prefix: string, existing: Array<{ id: string }>): string {
  const nums = existing.map((e) => Number(e.id.replace(/^[a-z]+(\d+).*$/, "$1")) || 0);
  return `${prefix}${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

function nextBulletId(parentId: string, bullets: Array<{ id: string }>): string {
  const nums = bullets.map((b) => Number(b.id.split("b").pop()) || 0);
  return `${parentId}b${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

function listToText(items: string[]): string {
  return items.join(", ");
}
function textToList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ProfileEditor({ initial }: { initial: Profile }) {
  const [p, setP] = useState<Profile>(initial);
  const [state, setState] = useState<{ error?: string; ok?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const update = (patch: Partial<Profile>) => setP((prev) => ({ ...prev, ...patch }));

  function save() {
    setState(null);
    start(async () => {
      const result = await saveProfileAction(JSON.stringify(p));
      setState(result);
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Contact</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(["name", "email", "phone", "location", "linkedin", "website"] as const).map((k) => (
            <div key={k}>
              <Label className="capitalize">{k}</Label>
              <Input value={p.contact[k] ?? ""} onChange={(e) => update({ contact: { ...p.contact, [k]: e.target.value || (k === "name" ? "" : null) } })} />
            </div>
          ))}
        </div>
        <div>
          <Label>Headline</Label>
          <Input value={p.headline ?? ""} onChange={(e) => update({ headline: e.target.value || null })} placeholder="Senior product manager, marketplaces" />
        </div>
        <div>
          <Label>Summary</Label>
          <Textarea rows={3} value={p.summary ?? ""} onChange={(e) => update({ summary: e.target.value || null })} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Work experience</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const id = nextId("w", p.work);
              update({ work: [...p.work, { id, company: "", title: "", location: null, start: null, end: null, bullets: [] }] });
            }}
          >
            + Role
          </Button>
        </div>
        {p.work.map((w, wi) => (
          <div key={w.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="grid gap-2 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label>Company</Label>
                <Input value={w.company} onChange={(e) => update({ work: p.work.map((x, i) => (i === wi ? { ...x, company: e.target.value } : x)) })} />
              </div>
              <div className="md:col-span-2">
                <Label>Title</Label>
                <Input value={w.title} onChange={(e) => update({ work: p.work.map((x, i) => (i === wi ? { ...x, title: e.target.value } : x)) })} />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={w.location ?? ""} onChange={(e) => update({ work: p.work.map((x, i) => (i === wi ? { ...x, location: e.target.value || null } : x)) })} />
              </div>
              <div>
                <Label>Start (YYYY-MM)</Label>
                <Input value={w.start ?? ""} placeholder="2021-03" onChange={(e) => update({ work: p.work.map((x, i) => (i === wi ? { ...x, start: e.target.value || null } : x)) })} />
              </div>
              <div>
                <Label>End (blank = current)</Label>
                <Input value={w.end ?? ""} placeholder="2024-06" onChange={(e) => update({ work: p.work.map((x, i) => (i === wi ? { ...x, end: e.target.value || null } : x)) })} />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Label>Bullets (each one is a fact the AI may reword but never invent)</Label>
              {w.bullets.map((b, bi) => (
                <div key={b.id} className="flex gap-2">
                  <span className="mt-2 w-12 shrink-0 font-mono text-[10px] text-zinc-400">{b.id}</span>
                  <Textarea
                    rows={2}
                    className="min-h-0"
                    value={b.text}
                    onChange={(e) =>
                      update({ work: p.work.map((x, i) => (i === wi ? { ...x, bullets: x.bullets.map((y, j) => (j === bi ? { ...y, text: e.target.value } : y)) } : x)) })
                    }
                  />
                  <button type="button" className="text-xs text-zinc-400 hover:text-red-600" onClick={() => update({ work: p.work.map((x, i) => (i === wi ? { ...x, bullets: x.bullets.filter((_, j) => j !== bi) } : x)) })}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => update({ work: p.work.map((x, i) => (i === wi ? { ...x, bullets: [...x.bullets, { id: nextBulletId(x.id, x.bullets), text: "" }] } : x)) })}>
                  + Bullet
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => update({ work: p.work.filter((_, i) => i !== wi) })}>
                  Remove role
                </Button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Education</h2>
          <Button variant="secondary" size="sm" onClick={() => update({ education: [...p.education, { id: nextId("e", p.education), school: "", degree: null, field: null, start: null, end: null, notes: null }] })}>
            + Education
          </Button>
        </div>
        {p.education.map((e, ei) => (
          <div key={e.id} className="grid gap-2 rounded-lg border border-zinc-200 p-3 md:grid-cols-6 dark:border-zinc-800">
            {(["school", "degree", "field", "start", "end", "notes"] as const).map((k) => (
              <div key={k}>
                <Label className="capitalize">{k}</Label>
                <Input value={e[k] ?? ""} onChange={(ev) => update({ education: p.education.map((x, i) => (i === ei ? { ...x, [k]: ev.target.value || (k === "school" ? "" : null) } : x)) })} />
              </div>
            ))}
            <div className="md:col-span-6">
              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => update({ education: p.education.filter((_, i) => i !== ei) })}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Skills</h2>
        <Label>Comma-separated. Tailored resumes can only use skills listed here.</Label>
        <Textarea
          rows={3}
          defaultValue={p.skills.map((s) => s.name).join(", ")}
          onBlur={(e) => {
            const names = textToList(e.target.value);
            update({
              skills: names.map((name, i) => {
                const existing = p.skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
                return existing ?? { id: `s${i + 1}_${Date.now().toString(36)}`, name, category: null };
              }),
            });
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Certifications</h2>
        {p.certifications.map((c, ci) => (
          <div key={c.id} className="grid gap-2 md:grid-cols-4">
            <Input placeholder="Name" value={c.name} onChange={(e) => update({ certifications: p.certifications.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)) })} />
            <Input placeholder="Issuer" value={c.issuer ?? ""} onChange={(e) => update({ certifications: p.certifications.map((x, i) => (i === ci ? { ...x, issuer: e.target.value || null } : x)) })} />
            <Input placeholder="Date" value={c.date ?? ""} onChange={(e) => update({ certifications: p.certifications.map((x, i) => (i === ci ? { ...x, date: e.target.value || null } : x)) })} />
            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => update({ certifications: p.certifications.filter((_, i) => i !== ci) })}>
              Remove
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => update({ certifications: [...p.certifications, { id: nextId("c", p.certifications), name: "", issuer: null, date: null }] })}>
          + Certification
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Preferences</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Target titles (comma-separated)</Label>
            <Input defaultValue={listToText(p.preferences.targetTitles)} onBlur={(e) => update({ preferences: { ...p.preferences, targetTitles: textToList(e.target.value) } })} />
          </div>
          <div>
            <Label>Locations (comma-separated)</Label>
            <Input defaultValue={listToText(p.preferences.locations)} onBlur={(e) => update({ preferences: { ...p.preferences, locations: textToList(e.target.value) } })} />
          </div>
          <div>
            <Label>Remote</Label>
            <Select value={p.preferences.remote} onChange={(e) => update({ preferences: { ...p.preferences, remote: e.target.value as Profile["preferences"]["remote"] } })}>
              {["any", "remote", "hybrid", "onsite", "unknown"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Compensation floor</Label>
              <Input type="number" value={p.preferences.compFloor ?? ""} onChange={(e) => update({ preferences: { ...p.preferences, compFloor: e.target.value ? Number(e.target.value) : null } })} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={p.preferences.compCurrency ?? ""} placeholder="USD" onChange={(e) => update({ preferences: { ...p.preferences, compCurrency: e.target.value || null } })} />
            </div>
          </div>
          <div>
            <Label>Visa / work authorization notes</Label>
            <Input value={p.preferences.visaNotes ?? ""} onChange={(e) => update({ preferences: { ...p.preferences, visaNotes: e.target.value || null } })} />
          </div>
          <div>
            <Label>Earliest start</Label>
            <Input value={p.preferences.earliestStart ?? ""} placeholder="2026-12-01 or 'two weeks notice'" onChange={(e) => update({ preferences: { ...p.preferences, earliestStart: e.target.value || null } })} />
          </div>
          <div className="md:col-span-2">
            <Label>Dealbreakers (comma-separated)</Label>
            <Input defaultValue={listToText(p.preferences.dealbreakers)} onBlur={(e) => update({ preferences: { ...p.preferences, dealbreakers: textToList(e.target.value) } })} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={p.preferences.notes ?? ""} onChange={(e) => update({ preferences: { ...p.preferences, notes: e.target.value || null } })} />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-zinc-200 bg-white/90 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state?.ok ? <Notice tone="success">Saved.</Notice> : null}
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      </div>
    </div>
  );
}
