"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Notice, Textarea } from "./ui";
import { cn } from "@/lib/utils";

type Mode = "link" | "paste" | "pdf";

export function CaptureForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(mode === "link" ? "Fetching the page…" : "Reading the posting…");
    try {
      let res: Response;
      if (mode === "pdf") {
        if (!file) throw new Error("Choose a PDF first.");
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/capture", { method: "POST", body: form });
      } else {
        res = await fetch("/api/capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mode === "link" ? { url } : { text }),
        });
      }
      const data = (await res.json()) as { applicationId?: string; duplicate?: boolean; error?: string; hint?: string };
      if (!res.ok || !data.applicationId) {
        setError({ message: data.error ?? "Capture failed.", hint: data.hint });
        return;
      }
      router.push(`/applications/${data.applicationId}${data.duplicate ? "?duplicate=1" : ""}`);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Capture failed." });
    } finally {
      setBusy(null);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={cn("rounded-md px-3 py-1.5 text-sm", mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        {tab("link", "Link")}
        {tab("paste", "Paste text")}
        {tab("pdf", "PDF")}
      </div>

      {mode === "link" && (
        <div>
          <Label htmlFor="url">Posting URL</Label>
          <Input id="url" type="url" placeholder="https://boards.greenhouse.io/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <p className="mt-1 text-xs text-zinc-500">Greenhouse, Lever, and Ashby links are read directly. Other sites are best effort; if a site blocks fetching, paste the text instead.</p>
        </div>
      )}
      {mode === "paste" && (
        <div>
          <Label htmlFor="text">Posting text</Label>
          <Textarea id="text" rows={14} placeholder="Paste the whole job description, including requirements." value={text} onChange={(e) => setText(e.target.value)} required />
        </div>
      )}
      {mode === "pdf" && (
        <div>
          <Label htmlFor="file">PDF of the posting</Label>
          <Input id="file" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          <p className="mt-1 text-xs text-zinc-500">Print the posting page to PDF from your browser, then drop it here.</p>
        </div>
      )}

      {error ? (
        <Notice tone="error">
          {error.message}
          {error.hint ? <span className="block text-xs opacity-80">{error.hint}</span> : null}
        </Notice>
      ) : null}

      <Button type="submit" disabled={Boolean(busy)}>
        {busy ?? "Capture and analyze"}
      </Button>
    </form>
  );
}
