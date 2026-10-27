import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "../env";
import { getDb, schema } from "../db";
import type { ConversationRow } from "../db/schema";
import { APPLICATION_STATUSES, EVENT_TYPES, STATUS_LABELS } from "../constants";
import {
  addEvent,
  getApplicationBundle,
  getDocument,
  getProfile,
  listApplications,
  listMessages,
  touchApplication,
  type ApplicationBundle,
} from "../queries";
import {
  captureApplication,
  documentPlainText,
  generateCoverLetterForApplication,
  generateResumeForApplication,
  recomputeFit,
  setApplicationStatus,
} from "../services";
import { daysAgo, formatDate, truncate } from "../utils";
import { MODEL_MAIN, assertBudget, cachedSystem, getClient, logUsage, type MessageParam, type SystemBlock } from "./client";
import { loadMemories, memoryStrings } from "./memory";
import { mockChatReply } from "./mock";
import { CHAT_SYSTEM, renderFit, renderMemories, renderPosting, renderProfile } from "./prompts";

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; message: string };

type Emit = (event: ChatEvent) => void;

export function textOfBlocks(content: unknown[]): string {
  return content
    .map((b) => {
      const block = b as { type?: string; text?: string };
      return block.type === "text" && block.text ? block.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

async function storeMessage(conversationId: string, role: "user" | "assistant", content: unknown[], text: string): Promise<void> {
  const db = await getDb();
  await db.insert(schema.messages).values({ userId: env.userId, conversationId, role, content, text });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
}

function renderBundle(b: ApplicationBundle): string {
  const a = b.application;
  const lines = [
    `# Linked application [${a.id}]`,
    `${a.company} — ${a.title} | status: ${STATUS_LABELS[a.status]}` +
      (a.appliedAt ? ` | applied ${formatDate(a.appliedAt)}` : "") +
      (a.nextAction ? ` | next action: ${a.nextAction}${a.nextActionDue ? ` (due ${formatDate(a.nextActionDue)})` : ""}` : ""),
    a.notes ? `Notes: ${a.notes}` : "",
    "",
    b.posting ? renderPosting(b.posting.parsed) : "(no parsed posting)",
    "",
    a.fit ? renderFit(a.fit) : "(no fit analysis yet)",
    "",
    "## Recent events",
    ...(b.events.length ? b.events.slice(0, 12).map((e) => `- ${formatDate(e.occurredAt)} [${e.type}] ${e.title}${e.body ? `: ${truncate(e.body, 200)}` : ""}`) : ["(none)"]),
    "",
    "## Documents",
    ...(b.documents.length ? b.documents.map((d) => `- [${d.id}] ${d.title} (${d.kind}, v${d.version})`) : ["(none)"]),
    "",
    "## Contacts",
    ...(b.contacts.length ? b.contacts.map((c) => `- ${c.name}${c.role ? `, ${c.role}` : ""}${c.email ? ` <${c.email}>` : ""}`) : ["(none)"]),
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}

function buildTools(ctx: { conversation: ConversationRow; emit: Emit }) {
  const gate = (): string | null =>
    ctx.conversation.allowWrites
      ? null
      : "Change not applied: changes are disabled for this conversation. Ask the user to turn on the 'Allow changes' switch, then retry.";

  function define<S extends z.ZodType>(opts: {
    name: string;
    description: string;
    inputSchema: S;
    write?: boolean;
    run: (input: z.infer<S>) => Promise<string>;
  }) {
    return betaZodTool({
      name: opts.name,
      description: opts.description,
      inputSchema: opts.inputSchema,
      run: async (input) => {
        ctx.emit({ type: "tool_use", name: opts.name, input });
        if (opts.write) {
          const blocked = gate();
          if (blocked) {
            ctx.emit({ type: "tool_result", name: opts.name, ok: false, summary: "Changes are disabled for this conversation" });
            return blocked;
          }
        }
        try {
          const result = await opts.run(input);
          ctx.emit({ type: "tool_result", name: opts.name, ok: true, summary: truncate(result.replace(/\s+/g, " "), 140) });
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.emit({ type: "tool_result", name: opts.name, ok: false, summary: truncate(message, 140) });
          return `Error: ${message}`;
        }
      },
    });
  }

  const statusEnum = z.enum(APPLICATION_STATUSES);

  return [
    define({
      name: "get_profile",
      description: "Read the user's master profile (work history with bullet ids, education, skills, preferences).",
      inputSchema: z.object({}),
      run: async () => {
        const profile = await getProfile();
        return profile ? renderProfile(profile) : "No profile yet. Suggest importing a resume on the Profile page.";
      },
    }),
    define({
      name: "list_applications",
      description: "List the user's applications with ids, status, company, title, dates, and fit score. Filter by status when useful.",
      inputSchema: z.object({ status: statusEnum.nullable().describe("Filter by status, or null for all") }),
      run: async ({ status }) => {
        const apps = await listApplications(status ? { statuses: [status] } : {});
        if (apps.length === 0) return "No applications recorded.";
        return apps
          .map(
            (a) =>
              `- [${a.id}] ${a.company} — ${a.title} | ${STATUS_LABELS[a.status]}` +
              (a.appliedAt ? ` | applied ${formatDate(a.appliedAt)}` : "") +
              ` | last activity ${daysAgo(a.lastActivityAt)}` +
              (a.fit?.score !== undefined ? ` | fit ${a.fit.score}% (${a.fit.overall})` : "") +
              (a.nextAction ? ` | next: ${a.nextAction}` : ""),
          )
          .join("\n");
      },
    }),
    define({
      name: "get_application",
      description: "Read one application in full: parsed posting, fit analysis, events, documents, contacts, notes.",
      inputSchema: z.object({ application_id: z.string() }),
      run: async ({ application_id }) => {
        const bundle = await getApplicationBundle(application_id);
        return bundle ? renderBundle(bundle) : "Application not found.";
      },
    }),
    define({
      name: "search_documents",
      description: "Search the user's documents (resumes, cover letters, uploads) by words in the title or content.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }) => {
        const db = await getDb();
        const pattern = `%${query.trim()}%`;
        const rows = await db
          .select()
          .from(schema.documents)
          .where(and(eq(schema.documents.userId, env.userId), or(ilike(schema.documents.title, pattern), ilike(schema.documents.extractedText, pattern))))
          .limit(20);
        if (rows.length === 0) return "No matching documents.";
        return rows.map((d) => `- [${d.id}] ${d.title} (${d.kind}, v${d.version}${d.applicationId ? `, application ${d.applicationId}` : ", global"})`).join("\n");
      },
    }),
    define({
      name: "get_document_text",
      description: "Read the text content of a document by id.",
      inputSchema: z.object({ document_id: z.string() }),
      run: async ({ document_id }) => {
        const doc = await getDocument(document_id);
        if (!doc) return "Document not found.";
        const text = await documentPlainText(doc);
        return text ? truncate(text, 20_000) : "(no readable text in this document)";
      },
    }),
    define({
      name: "create_application",
      description:
        "Create a new application. Provide posting_text (the full job description) or source_url when available so the posting is parsed and a fit analysis runs; otherwise a bare record is created from company and title.",
      inputSchema: z.object({
        company: z.string(),
        title: z.string(),
        posting_text: z.string().nullable(),
        source_url: z.string().nullable(),
        status: statusEnum.nullable().describe("Initial status, default saved"),
      }),
      write: true,
      run: async (input) => {
        if (input.posting_text || input.source_url) {
          const result = await captureApplication({ url: input.source_url, text: input.posting_text });
          if (input.status && input.status !== "saved") await setApplicationStatus(result.application.id, input.status);
          return `${result.duplicate ? "Already existed" : "Created"} application [${result.application.id}] ${result.application.company} — ${result.application.title}` +
            (result.fit ? `. Fit: ${result.fit.overall} (${result.fit.score}% of must-haves)` : "");
        }
        const db = await getDb();
        const [app] = await db
          .insert(schema.applications)
          .values({ userId: env.userId, company: input.company, title: input.title, status: input.status ?? "saved", source: "chat" })
          .returning();
        await addEvent({ applicationId: app.id, type: "created", title: "Created from chat" });
        return `Created application [${app.id}] ${app.company} — ${app.title} without a posting. Ask for the posting link or text to enable fit analysis.`;
      },
    }),
    define({
      name: "update_application_status",
      description: "Change an application's status.",
      inputSchema: z.object({ application_id: z.string(), status: statusEnum }),
      write: true,
      run: async ({ application_id, status }) => {
        await setApplicationStatus(application_id, status);
        return `Status set to ${STATUS_LABELS[status]}.`;
      },
    }),
    define({
      name: "add_event",
      description: "Log an event on an application's timeline (note, email, interview, follow_up, reminder).",
      inputSchema: z.object({
        application_id: z.string(),
        type: z.enum(EVENT_TYPES),
        title: z.string(),
        body: z.string().nullable(),
        occurred_at: z.string().nullable().describe("ISO date or datetime; null for now"),
      }),
      write: true,
      run: async (input) => {
        await addEvent({
          applicationId: input.application_id,
          type: input.type,
          title: input.title,
          body: input.body,
          occurredAt: input.occurred_at ? new Date(input.occurred_at) : undefined,
        });
        return `Logged ${input.type}: ${input.title}`;
      },
    }),
    define({
      name: "set_next_action",
      description: "Set or clear the next action and its due date on an application.",
      inputSchema: z.object({
        application_id: z.string(),
        next_action: z.string().nullable(),
        due_date: z.string().nullable().describe("YYYY-MM-DD or null"),
      }),
      write: true,
      run: async (input) => {
        await touchApplication(input.application_id, {
          nextAction: input.next_action,
          nextActionDue: input.due_date ? new Date(input.due_date) : null,
        });
        return input.next_action ? `Next action set: ${input.next_action}${input.due_date ? ` (due ${input.due_date})` : ""}` : "Next action cleared.";
      },
    }),
    define({
      name: "append_application_notes",
      description: "Append a paragraph to the application's notes field.",
      inputSchema: z.object({ application_id: z.string(), text: z.string() }),
      write: true,
      run: async ({ application_id, text }) => {
        const bundle = await getApplicationBundle(application_id);
        if (!bundle) return "Application not found.";
        const notes = [bundle.application.notes?.trim(), text.trim()].filter(Boolean).join("\n\n");
        await touchApplication(application_id, { notes });
        return "Notes updated.";
      },
    }),
    define({
      name: "recompute_fit",
      description: "Re-run the fit analysis for an application against the current profile.",
      inputSchema: z.object({ application_id: z.string() }),
      run: async ({ application_id }) => {
        const fit = await recomputeFit(application_id);
        return renderFit(fit);
      },
    }),
    define({
      name: "generate_tailored_resume",
      description: "Generate a tailored resume (DOCX, with PDF on download) for an application from the master profile. Takes a minute.",
      inputSchema: z.object({ application_id: z.string(), instructions: z.string().nullable() }),
      write: true,
      run: async ({ application_id, instructions }) => {
        const { document, tailored } = await generateResumeForApplication(application_id, instructions);
        return `Generated ${document.title} [document ${document.id}].\nNotes:\n${tailored.notes_for_user.map((n) => `- ${n}`).join("\n")}`;
      },
    }),
    define({
      name: "generate_cover_letter",
      description: "Generate a cover letter (DOCX, with PDF on download) for an application. Takes a minute.",
      inputSchema: z.object({ application_id: z.string(), instructions: z.string().nullable() }),
      write: true,
      run: async ({ application_id, instructions }) => {
        const { document, letter } = await generateCoverLetterForApplication(application_id, instructions);
        return `Generated ${document.title} [document ${document.id}].\n\n${letter.paragraphs.join("\n\n")}`;
      },
    }),
  ];
}

export async function runChatTurn(opts: {
  conversationId: string;
  userText: string;
  emit: Emit;
  signal?: AbortSignal;
}): Promise<void> {
  const db = await getDb();
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, opts.conversationId), eq(schema.conversations.userId, env.userId)));
  if (!conversation) throw new Error("Conversation not found");

  const userText = opts.userText.trim();
  if (!userText) throw new Error("Empty message");

  const history = await listMessages(conversation.id);
  if (history.length === 0 && conversation.title === "New chat") {
    await db
      .update(schema.conversations)
      .set({ title: truncate(userText, 60) })
      .where(eq(schema.conversations.id, conversation.id));
  }
  await storeMessage(conversation.id, "user", [{ type: "text", text: userText }], userText);

  const [profile, bundle, memories, applications] = await Promise.all([
    getProfile(),
    conversation.applicationId ? getApplicationBundle(conversation.applicationId) : Promise.resolve(null),
    loadMemories(conversation.applicationId),
    listApplications(),
  ]);

  if (env.aiMock) {
    const context = [
      `- ${applications.length} application(s) tracked`,
      bundle ? `- This chat is linked to ${bundle.application.company} — ${bundle.application.title} (${STATUS_LABELS[bundle.application.status]})` : "",
      profile ? `- Profile on file for ${profile.contact.name || "(unnamed)"} with ${profile.work.length} role(s)` : "- No profile yet",
    ]
      .filter(Boolean)
      .join("\n");
    const reply = mockChatReply(userText, context);
    opts.emit({ type: "text", delta: reply });
    await storeMessage(conversation.id, "assistant", [{ type: "text", text: reply }], reply);
    opts.emit({ type: "done", conversationId: conversation.id });
    return;
  }

  await assertBudget();

  const system: SystemBlock[] = [
    cachedSystem(`${CHAT_SYSTEM}\n\n${profile ? renderProfile(profile) : "# Candidate master profile\n(none yet; suggest importing a resume on the Profile page)"}`),
    {
      type: "text",
      text: [
        `Today: ${new Date().toISOString().slice(0, 10)}`,
        `Changes allowed in this conversation: ${conversation.allowWrites ? "yes" : "no"}`,
        bundle ? renderBundle(bundle) : "This conversation is not linked to a specific application. Use list_applications to see them.",
        renderMemories(memoryStrings(memories)),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  const messages: MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as unknown as MessageParam),
    { role: "user", content: [{ type: "text", text: userText }] },
  ];

  const tools = buildTools({ conversation, emit: opts.emit });
  const runner = getClient().beta.messages.toolRunner(
    {
      model: MODEL_MAIN,
      max_tokens: 16000,
      system,
      messages,
      tools,
      stream: true,
      thread: false,
      max_iterations: 10,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal: opts.signal },
  );

  for await (const stream of runner) {
    stream.on("text", (delta) => opts.emit({ type: "text", delta }));
    const message = await stream.finalMessage();
    await logUsage({ model: message.model, purpose: "chat", applicationId: conversation.applicationId, usage: message.usage });
    await storeMessage(conversation.id, "assistant", message.content as unknown[], textOfBlocks(message.content as unknown[]));

    if (message.stop_reason === "refusal") {
      opts.emit({ type: "error", message: "The model declined to continue this request." });
      break;
    }
    if (message.stop_reason === "max_tokens") {
      opts.emit({ type: "error", message: "The reply was cut off. Try a shorter request." });
      break;
    }
    const toolResponse = await runner.generateToolResponse();
    if (toolResponse) {
      await storeMessage(conversation.id, "user", toolResponse.content as unknown[], "");
    }
  }

  opts.emit({ type: "done", conversationId: conversation.id });
}
