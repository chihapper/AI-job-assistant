"use client";

import Link from "next/link";
import { useTransition } from "react";
import { refreshCoachNoteAction } from "@/lib/actions";
import type { CoachNote } from "@/lib/ai/schemas";
import { Button, Card } from "./ui";
import { formatDateTime } from "@/lib/utils";

export function CoachNoteCard({ note }: { note: CoachNote | null }) {
  const [pending, start] = useTransition();
  return (
    <Card
      title="Today's coach note"
      action={
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => refreshCoachNoteAction())}>
          {pending ? "Thinking…" : "Refresh"}
        </Button>
      }
    >
      {note ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{note.note}</p>
          {note.top_actions.length > 0 && (
            <ol className="space-y-1.5 text-sm">
              {note.top_actions.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-xs text-zinc-400">{i + 1}.</span>
                  <span>
                    {a.application_id ? (
                      <Link href={`/applications/${a.application_id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                        {a.action}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.action}</span>
                    )}
                    <span className="text-zinc-500"> — {a.reason}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {note.generatedAt ? <p className="text-xs text-zinc-400">Generated {formatDateTime(note.generatedAt)}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Capture a posting or two and the coach note will appear here.</p>
      )}
    </Card>
  );
}
