"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from "@/lib/constants";
import { Button, Input, Label, Notice, Select } from "./ui";

export function DocumentUpload({ applicationId }: { applicationId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        if (applicationId) form.set("applicationId", applicationId);
        setBusy(true);
        try {
          const res = await fetch("/api/documents", { method: "POST", body: form });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) setError(data.error ?? "Upload failed.");
          else {
            (e.target as HTMLFormElement).reset();
            router.refresh();
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="min-w-48 flex-1">
        <Label htmlFor={`file-${applicationId ?? "global"}`}>File</Label>
        <Input id={`file-${applicationId ?? "global"}`} name="file" type="file" required />
      </div>
      <div>
        <Label>Kind</Label>
        <Select name="kind" defaultValue="other">
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOCUMENT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Uploading…" : "Upload"}
      </Button>
      {error ? (
        <div className="w-full">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </form>
  );
}
