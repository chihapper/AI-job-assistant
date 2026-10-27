import Link from "next/link";
import { CoachNoteCard } from "@/components/coach-note";
import { FitBadge, StatusBadge } from "@/components/status-badge";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { getCoachNote } from "@/lib/ai/coach";
import { getPostingsByIds, getProfile, listApplications, upcomingInterviews } from "@/lib/queries";
import { computeAlerts, pipelineCounts, type Alert } from "@/lib/rules";
import { daysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const severityTone: Record<Alert["severity"], "red" | "amber" | "neutral"> = { high: "red", medium: "amber", low: "neutral" };

export default async function HomePage() {
  const [applications, interviews, profile] = await Promise.all([listApplications(), upcomingInterviews(), getProfile()]);
  const postingsById = await getPostingsByIds(applications.map((a) => a.jobPostingId).filter((x): x is string => Boolean(x)));
  const alerts = computeAlerts({ applications, postingsById, upcomingInterviews: interviews });
  const counts = pipelineCounts(applications).filter((c) => c.count > 0);
  const note = await getCoachNote();
  const recent = applications.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {applications.length === 0 ? "Nothing tracked yet." : `${applications.length} application${applications.length === 1 ? "" : "s"} tracked.`}
            {!profile ? (
              <>
                {" "}
                <Link href="/profile" className="text-indigo-700 underline dark:text-indigo-300">
                  Import your resume
                </Link>{" "}
                to unlock fit analysis and tailoring.
              </>
            ) : null}
          </p>
        </div>
        <LinkButton href="/applications/new" variant="primary">
          + Capture a posting
        </LinkButton>
      </div>

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {counts.map((c) => (
            <Link key={c.status} href={`/applications?status=${c.status}`} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="font-semibold">{c.count}</span> <span className="text-zinc-500">{c.label}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Do today">
            {alerts.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing due. Follow-ups, deadlines, and interviews will show up here.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {alerts.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/applications/${a.applicationId}`} className="font-medium hover:underline">
                        {a.company} — {a.title}
                      </Link>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{a.message}</p>
                    </div>
                    <Badge tone={severityTone[a.severity]}>{a.kind.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" action={<Link href="/applications" className="text-sm text-indigo-700 hover:underline dark:text-indigo-300">All applications</Link>}>
            {recent.length === 0 ? (
              <EmptyState title="No applications yet">Paste a link, text, or a PDF of a posting to start tracking.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                        {a.company} — {a.title}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        Updated {daysAgo(a.lastActivityAt)}
                        {a.nextAction ? ` · Next: ${a.nextAction}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <FitBadge overall={a.fit?.overall} score={a.fit?.score} />
                      <StatusBadge status={a.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <CoachNoteCard note={note} />
          <Card title="Ask the assistant">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {"\u201cWhich of my applications should I follow up on?\u201d \u201cDraft a thank-you note for the interview.\u201d \u201cAm I qualified for this?\u201d"}
            </p>
            <LinkButton href="/chat" className="mt-3">
              Open chat
            </LinkButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
