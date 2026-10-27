"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Notice, Textarea } from "./ui";

export function ProfileImport({ hasProfile }: { hasProfile: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  async function send(body: FormData | string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/import", {
        method: "POST",
        ...(typeof body === "string" ? { headers: { "content-type": "application/json" }, body } : { body }),
      });
      const data = (await res.json()) as { error?: string; hint?: string; name?: string; roles?: number; skills?: number };
      if (!res.ok) setMsg({ tone: "error", text: `${data.error ?? "Import failed."}${data.hint ? ` ${data.hint}` : ""}` });
      else {
        setMsg({ tone: "success", text: `Imported ${data.name || "profile"}: ${data.roles} role(s), ${data.skills} skill(s). Review and edit below.` });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {hasProfile ? <Notice tone="warn">Importing again replaces work history, education, skills, and summary. Preferences are kept.</Notice> : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || file.size === 0) {
            setMsg({ tone: "error", text: "Choose a file first." });
            return;
          }
          void send(form);
        }}
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="resume-file">Resume (PDF, DOCX, or TXT)</Label>
          <Input id="resume-file" name="file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf" />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Importing…" : "Import"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? "Hide paste" : "Paste text instead"}
        </Button>
      </form>
      {showPaste ? (
        <div className="space-y-2">
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume text." />
          <Button variant="secondary" disabled={busy || !text.trim()} onClick={() => send(JSON.stringify({ text }))}>
            {busy ? "Importing…" : "Import pasted text"}
          </Button>
        </div>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  );
}
