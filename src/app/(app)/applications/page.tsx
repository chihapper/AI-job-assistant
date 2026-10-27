import Link from "next/link";
import { Kanban, type KanbanCard } from "@/components/kanban";
import { FitBadge, StatusBadge } from "@/components/status-badge";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";
import { listApplications } from "@/lib/queries";
import { cn, daysAgo, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const { view = "list", status } = await searchParams;
  const statusFilter = APPLICATION_STATUSES.includes(status as ApplicationStatus) ? (status as ApplicationStatus) : undefined;
  const all = await listApplications();
  const applications = statusFilter ? all.filter((a) => a.status === statusFilter) : all;

  const cards: KanbanCard[] = all.map((a) => ({
    id: a.id,
    company: a.company,
    title: a.title,
    status: a.status,
    lastActivityAt: a.lastActivityAt.toISOString(),
    nextAction: a.nextAction,
    fitOverall: a.fit?.overall ?? null,
    fitScore: a.fit?.score ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle={`${all.length} total`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
              <Link href="/applications?view=list" className={cn("px-3 py-1.5", view === "list" && "bg-zinc-100 font-medium dark:bg-zinc-800")}>
                List
              </Link>
              <Link href="/applications?view=kanban" className={cn("px-3 py-1.5", view === "kanban" && "bg-zinc-100 font-medium dark:bg-zinc-800")}>
                Board
              </Link>
            </div>
            <LinkButton href="/applications/new" variant="primary">
              + Capture
            </LinkButton>
          </div>
        }
      />

      {all.length === 0 ? (
        <EmptyState title="No applications yet">
          <Link href="/applications/new" className="text-indigo-700 underline dark:text-indigo-300">
            Capture your first posting
          </Link>{" "}
          from a link, pasted text, or a PDF.
        </EmptyState>
      ) : view === "kanban" ? (
        <Kanban cards={cards} />
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            <Link href="/applications" className={cn("rounded-full border px-2.5 py-1", !statusFilter ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 dark:border-zinc-700")}>
              All
            </Link>
            {APPLICATION_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/applications?status=${s}`}
                className={cn("rounded-full border px-2.5 py-1", statusFilter === s ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 dark:border-zinc-700")}
              >
                {STATUS_LABELS[s]}
              </Link>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500 uppercase dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2 font-medium">Company / role</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Fit</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Applied</th>
                  <th className="hidden px-4 py-2 font-medium lg:table-cell">Next action</th>
                  <th className="px-4 py-2 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {applications.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                        {a.company}
                      </Link>
                      <div className="text-xs text-zinc-500">{a.title}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      <FitBadge overall={a.fit?.overall} score={a.fit?.score} />
                    </td>
                    <td className="hidden px-4 py-2.5 text-zinc-500 md:table-cell">{a.appliedAt ? formatDate(a.appliedAt) : "—"}</td>
                    <td className="hidden max-w-56 truncate px-4 py-2.5 text-zinc-500 lg:table-cell">
                      {a.nextAction ?? "—"}
                      {a.nextActionDue ? <span className="text-xs"> · {formatDate(a.nextActionDue)}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{daysAgo(a.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
