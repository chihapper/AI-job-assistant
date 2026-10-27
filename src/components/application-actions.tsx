"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteApplicationAction, updateStatusAction } from "@/lib/actions";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";
import { Button, Notice, Select, Textarea } from "./ui";

export function StatusSelect({ applicationId, status }: { applicationId: string; status: ApplicationStatus }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => start(() => updateStatusAction(applicationId, e.target.value))}
      className="w-auto"
      aria-label="Status"
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this application and its documents? This cannot be undone.")) start(() => deleteApplicationAction(applicationId));
      }}
    >
      Delete
    </Button>
  );
}

type Kind = "tailor" | "cover-letter" | "fit";

export function GenerateButtons({ applicationId, hasProfile, hasPosting }: { applicationId: string; hasProfile: boolean; hasPosting: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string; notes?: string[] } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  async function run(kind: Kind) {
    setBusy(kind);
    setResult(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const data = (await res.json()) as { error?: string; hint?: string; title?: string; notes?: string[]; overall?: string; score?: number | null };
      if (!res.ok) {
        setResult({ tone: "error", text: `${data.error ?? "Failed."}${data.hint ? ` ${data.hint}` : ""}` });
        return;
      }
      if (kind === "fit") setResult({ tone: "success", text: `Fit recomputed: ${data.overall}${typeof data.score === "number" ? ` (${data.score}%)` : ""}.` });
      else setResult({ tone: "success", text: `Generated ${data.title}.`, notes: data.notes });
      router.refresh();
    } catch (err) {
      setResult({ tone: "error", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(null);
    }
  }

  const disabled = !hasProfile || !hasPosting || Boolean(busy);
  return (
    <div className="space-y-3">
      {!hasProfile ? <Notice tone="warn">Import your resume on the Profile page to enable tailoring and fit analysis.</Notice> : null}
      {!hasPosting ? <Notice tone="warn">This application has no parsed posting, so materials cannot be tailored.</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("tailor")} disabled={disabled}>
          {busy === "tailor" ? "Tailoring resume…" : "Tailor resume"}
        </Button>
        <Button variant="secondary" onClick={() => run("cover-letter")} disabled={disabled}>
          {busy === "cover-letter" ? "Writing…" : "Write cover letter"}
        </Button>
        <Button variant="ghost" onClick={() => run("fit")} disabled={disabled}>
          {busy === "fit" ? "Analyzing…" : "Recompute fit"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowInstructions((v) => !v)}>
          {showInstructions ? "Hide instructions" : "Add instructions"}
        </Button>
      </div>
      {showInstructions ? (
        <Textarea rows={3} placeholder="Optional: emphasize X, keep it to one page, mention the relocation, use a warmer tone…" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      ) : null}
      {result ? (
        <Notice tone={result.tone}>
          {result.text}
          {result.notes?.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
    </div>
  );
}

export function NewChatButton({ applicationId, label = "New chat about this" }: { applicationId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="whitespace-nowrap"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/conversations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ applicationId }),
          });
          const data = (await res.json()) as { id?: string };
          if (data.id) router.push(`/chat/${data.id}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Opening…" : label}
    </Button>
  );
}
