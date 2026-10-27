"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteConversationAction, toggleAllowWritesAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button, Notice, Textarea } from "./ui";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: Array<{ name: string; ok?: boolean; summary?: string }>;
}

interface StreamEvent {
  type: "text" | "tool_use" | "tool_result" | "done" | "error";
  delta?: string;
  name?: string;
  ok?: boolean;
  summary?: string;
  message?: string;
}

export function ChatUi({
  conversationId,
  initialMessages,
  allowWrites,
  linkedLabel,
}: {
  conversationId: string;
  initialMessages: ChatMessage[];
  allowWrites: boolean;
  linkedLabel: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allow, setAllow] = useState(allowWrites);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }, { id: assistantId, role: "assistant", text: "", tools: [] }]);

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let changed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as StreamEvent;
          if (ev.type === "text") patch((m) => ({ ...m, text: m.text + (ev.delta ?? "") }));
          else if (ev.type === "tool_use") patch((m) => ({ ...m, tools: [...(m.tools ?? []), { name: ev.name ?? "tool" }] }));
          else if (ev.type === "tool_result") {
            changed = changed || Boolean(ev.ok && ev.name && !ev.name.startsWith("get_") && !ev.name.startsWith("list_") && !ev.name.startsWith("search_"));
            patch((m) => {
              const tools = [...(m.tools ?? [])];
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].name === ev.name && tools[i].ok === undefined) {
                  tools[i] = { ...tools[i], ok: ev.ok, summary: ev.summary };
                  break;
                }
              }
              return { ...m, tools };
            });
          } else if (ev.type === "error") setError(ev.message ?? "Something went wrong.");
        }
      }
      if (changed) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
        <div className="text-zinc-500">{linkedLabel ? <>Linked to <span className="font-medium text-zinc-800 dark:text-zinc-200">{linkedLabel}</span></> : "General chat (not linked to an application)"}</div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allow}
              onChange={(e) => {
                const v = e.target.checked;
                setAllow(v);
                startTransition(() => toggleAllowWritesAction(conversationId, v));
              }}
            />
            <span>Allow changes</span>
          </label>
          <button
            type="button"
            className="text-xs text-zinc-400 hover:text-red-600"
            onClick={() => {
              if (confirm("Delete this conversation?")) startTransition(() => deleteConversationAction(conversationId));
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {"Ask anything about your search. Examples: \u201cAm I qualified for this one?\u201d, \u201cWhat should I follow up on this week?\u201d, \u201cLog that I had a phone screen today.\u201d"}
          </p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap", m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-800")}>
              {m.tools?.length ? (
                <ul className="mb-2 space-y-1">
                  {m.tools.map((t, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", t.ok === undefined ? "animate-pulse bg-amber-400" : t.ok ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="font-mono">{t.name}</span>
                      {t.summary ? <span className="truncate">· {t.summary}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.text || (m.role === "assistant" && streaming ? <span className="animate-pulse text-zinc-400">…</span> : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {error ? (
          <div className="mb-2">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            rows={2}
            className="min-h-0 flex-1"
            value={input}
            placeholder="Message… (Enter to send, Shift+Enter for a new line)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" disabled={streaming || !input.trim()}>
            {streaming ? "…" : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
