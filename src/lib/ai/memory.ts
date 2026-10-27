import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { env } from "../env";
import { getDb, schema } from "../db";
import type { MemoryRow } from "../db/schema";
import { MODEL_FAST, callStructured } from "./client";
import { mockExtractMemories } from "./mock";
import { MEMORY_SYSTEM } from "./prompts";
import { MemoryExtractionSchema } from "./schemas";

/** Global memories plus the ones scoped to the given application, newest first. */
export async function loadMemories(applicationId?: string | null): Promise<MemoryRow[]> {
  const db = await getDb();
  const scopeFilter = applicationId
    ? or(eq(schema.memories.scope, "global"), eq(schema.memories.applicationId, applicationId))
    : eq(schema.memories.scope, "global");
  return db
    .select()
    .from(schema.memories)
    .where(and(eq(schema.memories.userId, env.userId), isNull(schema.memories.supersededBy), scopeFilter))
    .orderBy(desc(schema.memories.createdAt))
    .limit(200);
}

export function memoryStrings(rows: MemoryRow[]): string[] {
  return rows.map((m) => `[${m.kind}] ${m.content}`);
}

/**
 * Runs after a chat turn. Reads the recent transcript plus existing memories and
 * records only durable, new facts. Cheap model, low effort.
 */
export async function extractMemoriesForConversation(conversationId: string): Promise<number> {
  const db = await getDb();
  const [convo] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, env.userId)));
  if (!convo) return 0;

  const msgs = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
  const transcriptLines = msgs
    .filter((m) => m.text.trim())
    .slice(-30)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.slice(0, 2000)}`);
  if (transcriptLines.length < 2 || !msgs.some((m) => m.role === "user" && m.text.trim())) return 0;

  const existing = await loadMemories(convo.applicationId);
  const extraction = env.aiMock
    ? mockExtractMemories()
    : await callStructured({
        model: MODEL_FAST,
        purpose: "memory_extraction",
        applicationId: convo.applicationId,
        system: [{ type: "text", text: MEMORY_SYSTEM }],
        messages: [
          {
            role: "user",
            content:
              `# Existing memories\n` +
              (existing.length ? existing.map((m) => `- (${m.id}) [${m.kind}] ${m.content}`).join("\n") : "(none)") +
              `\n\n# Conversation${convo.applicationId ? " (about one specific application)" : ""}\n` +
              transcriptLines.join("\n"),
          },
        ],
        schema: MemoryExtractionSchema,
        effort: "low",
        maxTokens: 4000,
      });

  const existingIds = new Set(existing.map((m) => m.id));
  const superseded = extraction.superseded_memory_ids.filter((id) => existingIds.has(id));

  let inserted = 0;
  const newIds: string[] = [];
  for (const m of extraction.new_memories) {
    const content = m.content.trim();
    if (!content) continue;
    if (existing.some((e) => e.content.trim().toLowerCase() === content.toLowerCase())) continue;
    const [row] = await db
      .insert(schema.memories)
      .values({
        userId: env.userId,
        kind: m.kind,
        content,
        scope: m.scope === "application" && convo.applicationId ? "application" : "global",
        applicationId: m.scope === "application" ? convo.applicationId : null,
        sourceConversationId: conversationId,
        confidence: Math.max(0, Math.min(1, m.confidence)),
      })
      .returning({ id: schema.memories.id });
    newIds.push(row.id);
    inserted += 1;
  }

  if (superseded.length > 0) {
    // Point at the first replacement when there is one; otherwise mark as retired by self-reference.
    for (const id of superseded) {
      await db
        .update(schema.memories)
        .set({ supersededBy: newIds[0] ?? id })
        .where(eq(schema.memories.id, id));
    }
  }

  await db
    .update(schema.conversations)
    .set({ lastMemoryExtractionAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
  return inserted;
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.memories).where(and(eq(schema.memories.id, id), eq(schema.memories.userId, env.userId)));
}

export async function listAllMemories(): Promise<MemoryRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.memories)
    .where(and(eq(schema.memories.userId, env.userId), isNull(schema.memories.supersededBy)))
    .orderBy(desc(schema.memories.createdAt));
}

export async function memoriesForApplications(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ applicationId: schema.memories.applicationId, n: sql<number>`count(*)` })
    .from(schema.memories)
    .where(and(eq(schema.memories.userId, env.userId), inArray(schema.memories.applicationId, ids)))
    .groupBy(schema.memories.applicationId);
  return new Map(rows.filter((r) => r.applicationId).map((r) => [r.applicationId as string, Number(r.n)]));
}
