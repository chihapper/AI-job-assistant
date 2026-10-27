import { MemoryList, type MemoryItem } from "@/components/memory-list";
import { Card, PageHeader } from "@/components/ui";
import { listAllMemories } from "@/lib/ai/memory";
import { env } from "@/lib/env";
import { listApplications, usageSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [memories, usage, applications] = await Promise.all([listAllMemories(), usageSummary(), listApplications()]);
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const items: MemoryItem[] = memories.map((m) => ({
    id: m.id,
    kind: m.kind,
    content: m.content,
    scope: m.scope,
    applicationLabel: m.applicationId ? (appsById.get(m.applicationId)?.company ?? "an application") : null,
    confidence: m.confidence,
    createdAt: m.createdAt.toISOString(),
  }));
  const budget = env.monthlyBudgetUsd;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="What the assistant remembers, what it costs, and how it is configured." />

      <Card title="Memory">
        <p className="mb-3 text-sm text-zinc-500">
          Private facts the assistant keeps between chats: preferences, constraints, decisions, and patterns. It uses them silently; you can forget any of them here.
        </p>
        <MemoryList memories={items} />
      </Card>

      <Card title="Usage this month">
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">${usage.monthUsd.toFixed(2)}</span>
          {budget > 0 ? (
            <span className={usage.monthUsd >= budget * 0.8 ? "text-sm text-amber-600" : "text-sm text-zinc-500"}>
              of ${budget.toFixed(0)} budget{usage.monthUsd >= budget ? " (reached; calls are paused)" : usage.monthUsd >= budget * 0.8 ? " (80% used)" : ""}
            </span>
          ) : (
            <span className="text-sm text-zinc-500">no budget set</span>
          )}
        </div>
        {usage.byPurpose.length > 0 ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {usage.byPurpose.map((r) => (
                <tr key={r.purpose}>
                  <td className="py-1.5 font-mono text-xs">{r.purpose}</td>
                  <td className="py-1.5 text-right text-zinc-500">{r.calls} calls</td>
                  <td className="py-1.5 text-right">${r.usd.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">No model calls yet.</p>
        )}
      </Card>

      <Card title="Configuration">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <dt className="text-zinc-500">AI mode</dt>
          <dd>{env.aiMock ? "Mock (no API key configured, or AI_MOCK=1)" : "Live"}</dd>
          <dt className="text-zinc-500">Main model</dt>
          <dd className="font-mono text-xs">{env.modelMain}</dd>
          <dt className="text-zinc-500">Fast model</dt>
          <dd className="font-mono text-xs">{env.modelFast}</dd>
          <dt className="text-zinc-500">Database</dt>
          <dd>{env.databaseUrl ? "Postgres (DATABASE_URL)" : `Embedded PGlite in ${env.dataDir}`}</dd>
          <dt className="text-zinc-500">File storage</dt>
          <dd>{env.storageDriver === "supabase" ? `Supabase Storage (${env.supabaseBucket})` : `Local disk in ${env.dataDir}/files`}</dd>
          <dt className="text-zinc-500">Sign-in gate</dt>
          <dd>{env.appPassword ? "On" : env.isProduction ? "On (APP_PASSWORD missing!)" : "Off (development)"}</dd>
        </dl>
      </Card>
    </div>
  );
}
