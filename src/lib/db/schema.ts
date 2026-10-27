import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CoachNote,
  CoverLetter,
  FitAnalysis,
  JobPosting,
  Profile,
  TailoredResume,
} from "../ai/schemas";
import type { ApplicationStatus, DocumentKind, EventType, MemoryKind } from "../constants";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  data: jsonb("data").$type<Profile>().notNull(),
  sourceDocumentId: uuid("source_document_id"),
  ...timestamps,
});

export const jobPostings = pgTable("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  sourceUrl: text("source_url"),
  sourceKind: text("source_kind").$type<"url" | "pdf" | "paste" | "chat" | "search">().notNull(),
  rawText: text("raw_text").notNull(),
  parsed: jsonb("parsed").$type<JobPosting>().notNull(),
  contentHash: text("content_hash").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  jobPostingId: uuid("job_posting_id"),
  company: text("company").notNull(),
  title: text("title").notNull(),
  status: text("status").$type<ApplicationStatus>().notNull().default("saved"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  nextAction: text("next_action"),
  nextActionDue: timestamp("next_action_due", { withTimezone: true }),
  fit: jsonb("fit").$type<FitAnalysis>(),
  resumeDocumentId: uuid("resume_document_id"),
  coverLetterDocumentId: uuid("cover_letter_document_id"),
  source: text("source"),
  notes: text("notes"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  applicationId: uuid("application_id").notNull(),
  type: text("type").$type<EventType>().notNull(),
  title: text("title").notNull(),
  body: text("body"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  applicationId: uuid("application_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  applicationId: uuid("application_id"),
  kind: text("kind").$type<DocumentKind>().notNull(),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key"),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  version: integer("version").notNull().default(1),
  parentDocumentId: uuid("parent_document_id"),
  extractedText: text("extracted_text"),
  generatedData: jsonb("generated_data").$type<TailoredResume | CoverLetter>(),
  generationInput: jsonb("generation_input").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  applicationId: uuid("application_id"),
  title: text("title").notNull().default("New chat"),
  allowWrites: boolean("allow_writes").notNull().default(false),
  lastMemoryExtractionAt: timestamp("last_memory_extraction_at", { withTimezone: true }),
  ...timestamps,
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  /** Full content block array as sent to or returned by the API. */
  content: jsonb("content").$type<unknown[]>().notNull(),
  /** Plain-text rendering for display and memory extraction. */
  text: text("text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  kind: text("kind").$type<MemoryKind>().notNull(),
  content: text("content").notNull(),
  scope: text("scope").$type<"global" | "application">().notNull().default("global"),
  applicationId: uuid("application_id"),
  sourceConversationId: uuid("source_conversation_id"),
  confidence: real("confidence").notNull().default(0.7),
  supersededBy: uuid("superseded_by"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageLog = pgTable("usage_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  applicationId: uuid("application_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appState = pgTable(
  "app_state",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<CoachNote | Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type JobPostingRow = typeof jobPostings.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type ApplicationEventRow = typeof applicationEvents.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type UsageRow = typeof usageLog.$inferSelect;
