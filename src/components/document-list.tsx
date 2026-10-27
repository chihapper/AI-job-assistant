"use client";

import { useTransition } from "react";
import { deleteDocumentAction } from "@/lib/actions";
import { DOCUMENT_KIND_LABELS, type DocumentKind } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "./ui";

export interface DocumentItem {
  id: string;
  title: string;
  kind: DocumentKind;
  version: number;
  createdAt: string;
  generated: boolean;
  sizeBytes: number;
  notes?: string[];
}

export function DocumentList({ documents, compact = false }: { documents: DocumentItem[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  if (documents.length === 0) return <p className="text-sm text-zinc-500">No documents yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{d.title}</span>
              {!compact ? <Badge>{DOCUMENT_KIND_LABELS[d.kind]}</Badge> : null}
            </div>
            <p className="text-xs text-zinc-500">
              v{d.version} · {formatDate(d.createdAt)}
              {d.sizeBytes ? ` · ${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : ""}
            </p>
            {d.notes?.length ? (
              <ul className="mt-1 list-disc pl-4 text-xs text-zinc-500">
                {d.notes.slice(0, 4).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {d.generated ? (
              <>
                <a className="text-indigo-700 hover:underline dark:text-indigo-300" href={`/api/documents/${d.id}/download?format=docx`}>
                  DOCX
                </a>
                <a className="text-indigo-700 hover:underline dark:text-indigo-300" href={`/api/documents/${d.id}/download?format=pdf`}>
                  PDF
                </a>
              </>
            ) : (
              <a className="text-indigo-700 hover:underline dark:text-indigo-300" href={`/api/documents/${d.id}/download`}>
                Download
              </a>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this document?")) start(() => deleteDocumentAction(d.id));
              }}
              className="text-zinc-400 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
