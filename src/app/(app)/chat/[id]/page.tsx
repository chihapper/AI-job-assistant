import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatUi, type ChatMessage } from "@/components/chat-ui";
import { textOfBlocks } from "@/lib/ai/chat";
import { getApplication, getConversation, listMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();
  const [rows, app] = await Promise.all([listMessages(id), conversation.applicationId ? getApplication(conversation.applicationId) : null]);

  const messages: ChatMessage[] = [];
  for (const m of rows) {
    const blocks = m.content as Array<{ type?: string; name?: string }>;
    const text = m.text || textOfBlocks(m.content);
    const tools = blocks.filter((b) => b.type === "tool_use").map((b) => ({ name: b.name ?? "tool", ok: true }));
    if (m.role === "user" && !text) continue; // tool results
    if (m.role === "assistant" && !text && tools.length === 0) continue;
    const last = messages[messages.length - 1];
    if (m.role === "assistant" && last?.role === "assistant") {
      last.text = [last.text, text].filter(Boolean).join("\n\n");
      last.tools = [...(last.tools ?? []), ...tools];
      continue;
    }
    messages.push({ id: m.id, role: m.role, text, tools });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="truncate text-lg font-semibold">{conversation.title}</h1>
        <Link href="/chat" className="text-sm text-zinc-500 hover:underline">
          All chats
        </Link>
      </div>
      <ChatUi
        conversationId={conversation.id}
        initialMessages={messages}
        allowWrites={conversation.allowWrites}
        linkedLabel={app ? `${app.company} — ${app.title}` : null}
      />
    </div>
  );
}
