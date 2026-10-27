import Link from "next/link";
import { NewChatButton } from "@/components/application-actions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listApplications, listConversations } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChatIndexPage() {
  const [conversations, applications] = await Promise.all([listConversations(), listApplications()]);
  const appsById = new Map(applications.map((a) => [a.id, a]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat"
        subtitle="The assistant can read your applications, documents, and profile, and remembers what matters between conversations."
        action={<NewChatButton label="New general chat" />}
      />
      <Card title="Conversations">
        {conversations.length === 0 ? (
          <EmptyState title="No conversations yet">Start a general chat, or open an application and chat about it specifically.</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {conversations.map((c) => {
              const app = c.applicationId ? appsById.get(c.applicationId) : undefined;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/chat/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {app ? `${app.company} — ${app.title} · ` : "General · "}
                      {formatDateTime(c.updatedAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
