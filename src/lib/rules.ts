import type { ApplicationEventRow, ApplicationRow, JobPostingRow } from "./db/schema";
import { ACTIVE_STATUSES, STATUS_LABELS, type ApplicationStatus } from "./constants";

export type AlertKind =
  | "next_action_due"
  | "follow_up_due"
  | "deadline_soon"
  | "interview_soon"
  | "stale"
  | "missing_materials";

export interface Alert {
  kind: AlertKind;
  severity: "high" | "medium" | "low";
  applicationId: string;
  company: string;
  title: string;
  message: string;
  dueAt?: Date;
}

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY);
}

export function computeAlerts(input: {
  applications: ApplicationRow[];
  postingsById: Map<string, JobPostingRow>;
  upcomingInterviews: ApplicationEventRow[];
  now?: Date;
}): Alert[] {
  const now = input.now ?? new Date();
  const alerts: Alert[] = [];
  const appById = new Map(input.applications.map((a) => [a.id, a]));

  for (const ev of input.upcomingInterviews) {
    const app = appById.get(ev.applicationId);
    if (!app) continue;
    const inDays = daysBetween(ev.occurredAt, now);
    if (inDays >= 0 && inDays <= 7) {
      alerts.push({
        kind: "interview_soon",
        severity: "high",
        applicationId: app.id,
        company: app.company,
        title: app.title,
        message: `${ev.title} ${inDays === 0 ? "today" : `in ${inDays} day${inDays === 1 ? "" : "s"}`}`,
        dueAt: ev.occurredAt,
      });
    }
  }

  for (const app of input.applications) {
    const active = ACTIVE_STATUSES.includes(app.status);
    if (!active) continue;

    if (app.nextActionDue) {
      const diff = daysBetween(app.nextActionDue, now);
      if (diff <= 1) {
        alerts.push({
          kind: "next_action_due",
          severity: diff < 0 ? "high" : "medium",
          applicationId: app.id,
          company: app.company,
          title: app.title,
          message: `${app.nextAction ?? "Next action"} ${diff < 0 ? `overdue by ${-diff} day${-diff === 1 ? "" : "s"}` : diff === 0 ? "due today" : "due tomorrow"}`,
          dueAt: app.nextActionDue,
        });
      }
    }

    const posting = app.jobPostingId ? input.postingsById.get(app.jobPostingId) : undefined;
    const closes = posting?.parsed.closes_at ? new Date(posting.parsed.closes_at) : null;
    if (closes && (app.status === "saved" || app.status === "applying")) {
      const diff = daysBetween(closes, now);
      if (diff <= 3) {
        alerts.push({
          kind: "deadline_soon",
          severity: "high",
          applicationId: app.id,
          company: app.company,
          title: app.title,
          message: diff < 0 ? "Posting closed" : diff === 0 ? "Closes today" : `Closes in ${diff} day${diff === 1 ? "" : "s"}`,
          dueAt: closes,
        });
      }
    }

    if (app.status === "applied" && app.appliedAt) {
      const sinceApplied = daysBetween(now, app.appliedAt);
      const sinceActivity = daysBetween(now, app.lastActivityAt);
      if (sinceApplied >= 7 && sinceActivity >= 7 && sinceActivity < 21) {
        alerts.push({
          kind: "follow_up_due",
          severity: sinceApplied >= 14 ? "high" : "medium",
          applicationId: app.id,
          company: app.company,
          title: app.title,
          message: `Applied ${sinceApplied} days ago with no response. Send a follow-up.`,
        });
      }
    }

    if (app.status !== "saved") {
      const sinceActivity = daysBetween(now, app.lastActivityAt);
      if (sinceActivity >= 21) {
        alerts.push({
          kind: "stale",
          severity: "medium",
          applicationId: app.id,
          company: app.company,
          title: app.title,
          message: `No activity for ${sinceActivity} days. Follow up once more or mark as ghosted.`,
        });
      }
    }

    if (app.status === "applying" && !app.resumeDocumentId) {
      alerts.push({
        kind: "missing_materials",
        severity: "low",
        applicationId: app.id,
        company: app.company,
        title: app.title,
        message: "No tailored resume attached yet.",
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
}

export function pipelineCounts(applications: ApplicationRow[]): Array<{ status: ApplicationStatus; label: string; count: number }> {
  const counts = new Map<ApplicationStatus, number>();
  for (const a of applications) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
  return (Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((s) => ({
    status: s,
    label: STATUS_LABELS[s],
    count: counts.get(s) ?? 0,
  }));
}

export function renderPipelineSummary(input: {
  applications: ApplicationRow[];
  alerts: Alert[];
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const lines = ["# Pipeline"];
  for (const a of input.applications) {
    lines.push(
      `- [${a.id}] ${a.company} — ${a.title} | status: ${a.status}` +
        (a.appliedAt ? ` | applied ${daysBetween(now, a.appliedAt)}d ago` : "") +
        ` | last activity ${daysBetween(now, a.lastActivityAt)}d ago` +
        (a.nextAction ? ` | next: ${a.nextAction}${a.nextActionDue ? ` (due ${a.nextActionDue.toISOString().slice(0, 10)})` : ""}` : "") +
        (a.fit?.score !== undefined ? ` | fit ${a.fit.score}% (${a.fit.overall})` : ""),
    );
  }
  lines.push("\n# Alerts from rules");
  if (input.alerts.length === 0) lines.push("(none)");
  for (const al of input.alerts) lines.push(`- [${al.applicationId}] ${al.severity}: ${al.message}`);
  return lines.join("\n");
}
