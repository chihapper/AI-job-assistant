import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { env } from "./env";
import { getDb, schema } from "./db";
import type {
  ApplicationEventRow,
  ApplicationRow,
  ContactRow,
  ConversationRow,
  DocumentRow,
  JobPostingRow,
  MessageRow,
} from "./db/schema";
import type { Profile } from "./ai/schemas";
import type { ApplicationStatus, EventType } from "./constants";

const uid = () => env.userId;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, uid()));
  return row?.data ?? null;
}

export async function saveProfile(data: Profile, sourceDocumentId?: string | null): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.profiles)
    .values({ userId: uid(), data, sourceDocumentId: sourceDocumentId ?? null })
    .onConflictDoUpdate({
      target: schema.profiles.userId,
      set: {
        data,
        updatedAt: new Date(),
        ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
      },
    });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function listApplications(opts: { statuses?: ApplicationStatus[] } = {}): Promise<ApplicationRow[]> {
  const db = await getDb();
  const where = opts.statuses?.length
    ? and(eq(schema.applications.userId, uid()), inArray(schema.applications.status, opts.statuses))
    : eq(schema.applications.userId, uid());
  return db.select().from(schema.applications).where(where).orderBy(desc(schema.applications.lastActivityAt));
}

export async function getApplication(id: string): Promise<ApplicationRow | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, uid())));
  return row ?? null;
}

export interface ApplicationBundle {
  application: ApplicationRow;
  posting: JobPostingRow | null;
  events: ApplicationEventRow[];
  documents: DocumentRow[];
  contacts: ContactRow[];
  conversations: ConversationRow[];
}

export async function getApplicationBundle(id: string): Promise<ApplicationBundle | null> {
  const application = await getApplication(id);
  if (!application) return null;
  const db = await getDb();
  const [posting] = application.jobPostingId
    ? await db.select().from(schema.jobPostings).where(eq(schema.jobPostings.id, application.jobPostingId))
    : [];
  const events = await db
    .select()
    .from(schema.applicationEvents)
    .where(eq(schema.applicationEvents.applicationId, id))
    .orderBy(desc(schema.applicationEvents.occurredAt));
  const documents = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.applicationId, id))
    .orderBy(desc(schema.documents.createdAt));
  const contacts = await db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.applicationId, id))
    .orderBy(asc(schema.contacts.createdAt));
  const conversations = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.applicationId, id))
    .orderBy(desc(schema.conversations.updatedAt));
  return { application, posting: posting ?? null, events, documents, contacts, conversations };
}

export async function getPostingsByIds(ids: string[]): Promise<Map<string, JobPostingRow>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.select().from(schema.jobPostings).where(inArray(schema.jobPostings.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function touchApplication(id: string, patch: Partial<typeof schema.applications.$inferInsert> = {}): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.applications)
    .set({ ...patch, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, uid())));
}

export async function addEvent(input: {
  applicationId: string;
  type: EventType;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: Date;
  touch?: boolean;
}): Promise<ApplicationEventRow> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.applicationEvents)
    .values({
      userId: uid(),
      applicationId: input.applicationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      payload: input.payload ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();
  if (input.touch !== false) await touchApplication(input.applicationId);
  return row;
}

export async function upcomingInterviews(): Promise<ApplicationEventRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.applicationEvents)
    .where(
      and(
        eq(schema.applicationEvents.userId, uid()),
        eq(schema.applicationEvents.type, "interview"),
        gte(schema.applicationEvents.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(asc(schema.applicationEvents.occurredAt));
}

export async function findApplicationByPostingHash(hash: string): Promise<ApplicationRow | null> {
  const db = await getDb();
  const [posting] = await db
    .select()
    .from(schema.jobPostings)
    .where(and(eq(schema.jobPostings.userId, uid()), eq(schema.jobPostings.contentHash, hash)));
  if (!posting) return null;
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.jobPostingId, posting.id), eq(schema.applications.userId, uid())));
  return app ?? null;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function listDocuments(opts: { applicationId?: string | null; globalOnly?: boolean } = {}): Promise<DocumentRow[]> {
  const db = await getDb();
  const conds = [eq(schema.documents.userId, uid())];
  if (opts.applicationId) conds.push(eq(schema.documents.applicationId, opts.applicationId));
  if (opts.globalOnly) conds.push(isNull(schema.documents.applicationId));
  return db.select().from(schema.documents).where(and(...conds)).orderBy(desc(schema.documents.createdAt));
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, uid())));
  return row ?? null;
}

export async function nextDocumentVersion(applicationId: string | null, kind: DocumentRow["kind"]): Promise<number> {
  const db = await getDb();
  const conds = [eq(schema.documents.userId, uid()), eq(schema.documents.kind, kind)];
  conds.push(applicationId ? eq(schema.documents.applicationId, applicationId) : isNull(schema.documents.applicationId));
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${schema.documents.version}), 0)` })
    .from(schema.documents)
    .where(and(...conds));
  return Number(row?.max ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function listConversations(): Promise<ConversationRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, uid()))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(100);
}

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, uid())));
  return row ?? null;
}

export async function createConversation(input: { applicationId?: string | null; title?: string }): Promise<ConversationRow> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.conversations)
    .values({ userId: uid(), applicationId: input.applicationId ?? null, title: input.title ?? "New chat" })
    .returning();
  return row;
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.userId, uid())))
    .orderBy(asc(schema.messages.createdAt));
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export async function usageSummary(): Promise<{ monthUsd: number; byPurpose: Array<{ purpose: string; usd: number; calls: number }> }> {
  const db = await getDb();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({
      purpose: schema.usageLog.purpose,
      usd: sql<number>`coalesce(sum(${schema.usageLog.costUsd}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(schema.usageLog)
    .where(and(eq(schema.usageLog.userId, uid()), gte(schema.usageLog.createdAt, start)))
    .groupBy(schema.usageLog.purpose);
  const byPurpose = rows.map((r) => ({ purpose: r.purpose, usd: Number(r.usd), calls: Number(r.calls) })).sort((a, b) => b.usd - a.usd);
  return { monthUsd: byPurpose.reduce((acc, r) => acc + r.usd, 0), byPurpose };
}
