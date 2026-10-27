import { and, eq, gte, inArray } from "drizzle-orm";
import { env } from "../env";
import { getDb, schema } from "../db";
import { ACTIVE_STATUSES } from "../constants";
import { computeAlerts, renderPipelineSummary } from "../rules";
import { MODEL_MAIN, callStructured } from "./client";
import { mockCoachNote } from "./mock";
import { COACH_SYSTEM } from "./prompts";
import { CoachNoteSchema, type CoachNote } from "./schemas";

const KEY = "coach_note";
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getCoachNote(opts: { force?: boolean } = {}): Promise<CoachNote | null> {
  const db = await getDb();
  const [state] = await db
    .select()
    .from(schema.appState)
    .where(and(eq(schema.appState.userId, env.userId), eq(schema.appState.key, KEY)));
  const cached = state?.value as CoachNote | undefined;
  if (cached?.generatedAt && !opts.force && Date.now() - Date.parse(cached.generatedAt) < TTL_MS) {
    return cached;
  }

  const applications = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, env.userId), inArray(schema.applications.status, ACTIVE_STATUSES)));
  if (applications.length === 0) return null;

  const postingIds = applications.map((a) => a.jobPostingId).filter((x): x is string => Boolean(x));
  const postings = postingIds.length
    ? await db.select().from(schema.jobPostings).where(inArray(schema.jobPostings.id, postingIds))
    : [];
  const upcomingInterviews = await db
    .select()
    .from(schema.applicationEvents)
    .where(
      and(
        eq(schema.applicationEvents.userId, env.userId),
        eq(schema.applicationEvents.type, "interview"),
        gte(schema.applicationEvents.occurredAt, new Date()),
      ),
    );
  const alerts = computeAlerts({
    applications,
    postingsById: new Map(postings.map((p) => [p.id, p])),
    upcomingInterviews,
  });
  const summary = renderPipelineSummary({ applications, alerts });

  const note: CoachNote = env.aiMock
    ? mockCoachNote(summary)
    : {
        ...(await callStructured({
          model: MODEL_MAIN,
          purpose: "coach_note",
          system: [{ type: "text", text: COACH_SYSTEM }],
          messages: [{ role: "user", content: summary }],
          schema: CoachNoteSchema,
          effort: "low",
          maxTokens: 4000,
        })),
        generatedAt: new Date().toISOString(),
      };

  await db
    .insert(schema.appState)
    .values({ userId: env.userId, key: KEY, value: note, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.appState.userId, schema.appState.key],
      set: { value: note, updatedAt: new Date() },
    });
  return note;
}
