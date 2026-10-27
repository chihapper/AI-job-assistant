"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, clearSession, createSession, isAuthenticated } from "./auth";
import { getDb, schema } from "./db";
import { env } from "./env";
import { APPLICATION_STATUSES, EVENT_TYPES, STATUS_LABELS, type ApplicationStatus, type EventType } from "./constants";
import { ProfileSchema } from "./ai/schemas";
import { addEvent, getApplication, saveProfile, touchApplication } from "./queries";
import { deleteMemory } from "./ai/memory";
import { getCoachNote } from "./ai/coach";
import { getStorage } from "./storage";

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Not signed in");
}

export type ActionState = { error?: string; ok?: boolean };

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: env.appPassword ? "Wrong password." : "APP_PASSWORD is not set on the server." };
  }
  await createSession();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export async function updateStatusAction(applicationId: string, status: string): Promise<void> {
  await guard();
  if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) throw new Error("Invalid status");
  const app = await getApplication(applicationId);
  if (!app) throw new Error("Application not found");
  const next = status as ApplicationStatus;
  if (app.status === next) return;
  await touchApplication(applicationId, {
    status: next,
    ...(next === "applied" && !app.appliedAt ? { appliedAt: new Date() } : {}),
  });
  await addEvent({
    applicationId,
    type: "status_change",
    title: `Status: ${STATUS_LABELS[app.status]} → ${STATUS_LABELS[next]}`,
    payload: { from: app.status, to: next },
  });
  revalidatePath("/", "layout");
}

export async function setNextActionAction(applicationId: string, formData: FormData): Promise<void> {
  await guard();
  const nextAction = String(formData.get("nextAction") ?? "").trim() || null;
  const due = String(formData.get("nextActionDue") ?? "").trim();
  await touchApplication(applicationId, { nextAction, nextActionDue: due ? new Date(due) : null });
  revalidatePath("/", "layout");
}

export async function addEventAction(applicationId: string, formData: FormData): Promise<void> {
  await guard();
  const type = String(formData.get("type") ?? "note");
  if (!EVENT_TYPES.includes(type as EventType)) throw new Error("Invalid event type");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const when = String(formData.get("occurredAt") ?? "").trim();
  if (!title) throw new Error("Title is required");
  await addEvent({
    applicationId,
    type: type as EventType,
    title,
    body,
    occurredAt: when ? new Date(when) : new Date(),
  });
  revalidatePath("/", "layout");
}

export async function updateNotesAction(applicationId: string, formData: FormData): Promise<void> {
  await guard();
  const notes = String(formData.get("notes") ?? "");
  const db = await getDb();
  await db
    .update(schema.applications)
    .set({ notes, updatedAt: new Date() })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, env.userId)));
  revalidatePath(`/applications/${applicationId}`);
}

export async function addContactAction(applicationId: string, formData: FormData): Promise<void> {
  await guard();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  const db = await getDb();
  await db.insert(schema.contacts).values({
    userId: env.userId,
    applicationId,
    name,
    role: String(formData.get("role") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath(`/applications/${applicationId}`);
}

export async function deleteContactAction(contactId: string, applicationId: string): Promise<void> {
  await guard();
  const db = await getDb();
  await db.delete(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, env.userId)));
  revalidatePath(`/applications/${applicationId}`);
}

export async function deleteApplicationAction(applicationId: string): Promise<void> {
  await guard();
  const db = await getDb();
  const app = await getApplication(applicationId);
  if (!app) return;
  const docs = await db.select().from(schema.documents).where(eq(schema.documents.applicationId, applicationId));
  const storage = getStorage();
  for (const d of docs) if (d.storageKey) await storage.delete(d.storageKey).catch(() => undefined);
  await db.delete(schema.documents).where(eq(schema.documents.applicationId, applicationId));
  await db.delete(schema.applicationEvents).where(eq(schema.applicationEvents.applicationId, applicationId));
  await db.delete(schema.contacts).where(eq(schema.contacts.applicationId, applicationId));
  await db.delete(schema.applications).where(eq(schema.applications.id, applicationId));
  if (app.jobPostingId) await db.delete(schema.jobPostings).where(eq(schema.jobPostings.id, app.jobPostingId));
  revalidatePath("/", "layout");
  redirect("/applications");
}

export async function saveProfileAction(profileJson: string): Promise<ActionState> {
  await guard();
  let parsed: unknown;
  try {
    parsed = JSON.parse(profileJson);
  } catch {
    return { error: "Profile data was not valid JSON." };
  }
  const result = ProfileSchema.safeParse(parsed);
  if (!result.success) {
    return { error: `Profile validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join("; ")}` };
  }
  await saveProfile(result.data);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleAllowWritesAction(conversationId: string, allow: boolean): Promise<void> {
  await guard();
  const db = await getDb();
  await db
    .update(schema.conversations)
    .set({ allowWrites: allow, updatedAt: new Date() })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, env.userId)));
  revalidatePath(`/chat/${conversationId}`);
}

export async function deleteConversationAction(conversationId: string): Promise<void> {
  await guard();
  const db = await getDb();
  await db.delete(schema.messages).where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.userId, env.userId)));
  await db
    .delete(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, env.userId)));
  revalidatePath("/chat");
  redirect("/chat");
}

export async function deleteMemoryAction(memoryId: string): Promise<void> {
  await guard();
  await deleteMemory(memoryId);
  revalidatePath("/settings");
}

export async function deleteDocumentAction(documentId: string): Promise<void> {
  await guard();
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.userId, env.userId)));
  if (!doc) return;
  if (doc.storageKey) await getStorage().delete(doc.storageKey).catch(() => undefined);
  await db.delete(schema.documents).where(eq(schema.documents.id, documentId));
  await db
    .update(schema.applications)
    .set({ resumeDocumentId: null })
    .where(eq(schema.applications.resumeDocumentId, documentId));
  await db
    .update(schema.applications)
    .set({ coverLetterDocumentId: null })
    .where(eq(schema.applications.coverLetterDocumentId, documentId));
  revalidatePath("/", "layout");
}

export async function refreshCoachNoteAction(): Promise<void> {
  await guard();
  await getCoachNote({ force: true });
  revalidatePath("/");
}
