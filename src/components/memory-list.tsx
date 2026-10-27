"use client";

import { useTransition } from "react";
import { deleteMemoryAction } from "@/lib/actions";
import { formatDate } from "@/lib/utils";
import { Badge } from "./ui";

export interface MemoryItem {
  id: string;
  kind: string;
  content: string;
  scope: string;
  applicationLabel: string | null;
  confidence: number;
  createdAt: string;
}

export function MemoryList({ memories }: { memories: MemoryItem[] }) {
  const [pending, start] = useTransition();
  if (memories.length === 0) return <p className="text-sm text-zinc-500">Nothing remembered yet. Memories are extracted from chats automatically.</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {memories.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
          <div>
            <p className="text-sm">{m.content}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Badge>{m.kind}</Badge>
              <span>{m.applicationLabel ? `About ${m.applicationLabel}` : "Global"}</span>
              <span>· confidence {Math.round(m.confidence * 100)}%</span>
              <span>· {formatDate(m.createdAt)}</span>
            </div>
          </div>
          <button type="button" disabled={pending} onClick={() => start(() => deleteMemoryAction(m.id))} className="text-xs text-zinc-400 hover:text-red-600">
            Forget
          </button>
        </li>
      ))}
    </ul>
  );
}
