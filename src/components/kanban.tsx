"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateStatusAction } from "@/lib/actions";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";
import { cn, daysAgo } from "@/lib/utils";
import { FitBadge } from "./status-badge";

export interface KanbanCard {
  id: string;
  company: string;
  title: string;
  status: ApplicationStatus;
  lastActivityAt: string;
  nextAction: string | null;
  fitOverall: string | null;
  fitScore: number | null;
}

export function Kanban({ cards }: { cards: KanbanCard[] }) {
  const [items, setItems] = useState(cards);
  const [pending, start] = useTransition();
  const [over, setOver] = useState<ApplicationStatus | null>(null);

  function move(id: string, status: ApplicationStatus) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    start(() => updateStatusAction(id, status));
  }

  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-4", pending && "opacity-80")}>
      {APPLICATION_STATUSES.map((status) => {
        const column = items.filter((c) => c.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setOver(null);
              if (id) move(id, status);
            }}
            className={cn(
              "flex w-60 shrink-0 flex-col rounded-xl border bg-zinc-100/60 p-2 dark:bg-zinc-900/60",
              over === status ? "border-indigo-400" : "border-zinc-200 dark:border-zinc-800",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              <span>{STATUS_LABELS[status]}</span>
              <span>{column.length}</span>
            </div>
            <div className="flex min-h-16 flex-col gap-2">
              {column.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <Link href={`/applications/${c.id}`} className="font-medium hover:underline">
                    {c.company}
                  </Link>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{c.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <FitBadge overall={c.fitOverall} score={c.fitScore} />
                    <span className="text-[11px] text-zinc-400">{daysAgo(c.lastActivityAt)}</span>
                  </div>
                  <select
                    aria-label="Move to status"
                    value={c.status}
                    onChange={(e) => move(c.id, e.target.value as ApplicationStatus)}
                    className="mt-2 w-full rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-xs text-zinc-500 md:hidden dark:border-zinc-700"
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
