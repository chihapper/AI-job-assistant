import { eq } from "drizzle-orm";
import { env } from "./env";
import { getDb, schema } from "./db";
import type { ApplicationRow, DocumentRow, JobPostingRow } from "./db/schema";
import type { DocumentKind } from "./constants";
import { analyzeFit } from "./ai/fit";
import { importProfile } from "./ai/profile-import";
import { loadMemories, memoryStrings } from "./ai/memory";
import { contentHash, parsePosting } from "./ai/posting";
import { coverLetterToText, tailorResume, writeCoverLetter } from "./ai/tailor";
import type { CoverLetter, FitAnalysis, Profile, RenderableResume, TailoredResume } from "./ai/schemas";
import { fetchPostingFromUrl } from "./ingest/fetch-url";
import { detectMime, extractText, isDocx, isPdf } from "./ingest/extract-text";
import { coverLetterToDocx, coverLetterToPdf, resumeToDocx, resumeToPdf } from "./render";
import {
  addEvent,
  findApplicationByPostingHash,
  getApplicationBundle,
  getProfile,
  nextDocumentVersion,
  saveProfile,
  touchApplication,
} from "./queries";
import { getStorage, newStorageKey } from "./storage";
import { slugify } from "./utils";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface CaptureInput {
  url?: string | null;
  text?: string | null;
  pdf?: { buffer: Buffer; filename: string } | null;
}

export interface CaptureResult {
  application: ApplicationRow;
  posting: JobPostingRow | null;
  duplicate: boolean;
  via?: string;
  fit?: FitAnalysis | null;
}

export async function captureApplication(input: CaptureInput): Promise<CaptureResult> {
  let text = input.text?.trim() ?? "";
  let sourceUrl = input.url?.trim() || null;
  let via: string | undefined;
  let sourceKind: "url" | "pdf" | "paste" = "paste";

  if (input.pdf) {
    sourceKind = "pdf";
    text = text || (await extractText(input.pdf.buffer, "application/pdf"));
  } else if (sourceUrl && !text) {
    const fetched = await fetchPostingFromUrl(sourceUrl);
    text = fetched.text;
    sourceUrl = fetched.finalUrl;
    via = fetched.via;
    sourceKind = "url";
  }
  if (!text && !input.pdf) throw new Error("Nothing to capture: provide a link, pasted text, or a PDF.");

  const hash = contentHash(text || `${input.pdf?.filename}:${input.pdf?.buffer.length}`);
  const existing = await findApplicationByPostingHash(hash);
  if (existing) {
    const bundle = await getApplicationBundle(existing.id);
    return { application: existing, posting: bundle?.posting ?? null, duplicate: true, via };
  }

  const parsed = await parsePosting({
    text: text || undefined,
    pdfBase64: input.pdf ? input.pdf.buffer.toString("base64") : undefined,
    sourceUrl,
  });

  const db = await getDb();
  const [posting] = await db
    .insert(schema.jobPostings)
    .values({
      userId: env.userId,
      sourceUrl,
      sourceKind,
      rawText: text || `(PDF: ${input.pdf?.filename})`,
      parsed,
      contentHash: hash,
    })
    .returning();

  const [application] = await db
    .insert(schema.applications)
    .values({
      userId: env.userId,
      jobPostingId: posting.id,
      company: parsed.company,
      title: parsed.title,
      status: "saved",
      source: sourceKind,
    })
    .returning();

  await addEvent({
    applicationId: application.id,
    type: "created",
    title: `Captured from ${sourceKind === "url" ? "link" : sourceKind === "pdf" ? "PDF" : "pasted text"}`,
    body: sourceUrl,
    touch: false,
  });

  if (input.pdf) {
    await uploadDocument({
      applicationId: application.id,
      kind: "job_posting",
      buffer: input.pdf.buffer,
      filename: input.pdf.filename,
      mime: "application/pdf",
      title: `Posting: ${parsed.company} — ${parsed.title}`,
      extractedText: text,
    });
  }

  let fit: FitAnalysis | null = null;
  const profile = await getProfile();
  if (profile) {
    fit = await runFit(application.id, profile, parsed);
  }

  return { application: { ...application, fit }, posting, duplicate: false, via, fit };
}

async function runFit(applicationId: string, profile: Profile, posting: JobPostingRow["parsed"]): Promise<FitAnalysis> {
  const memories = memoryStrings(await loadMemories(applicationId));
  const fit = await analyzeFit({ profile, posting, memories, applicationId });
  await touchApplication(applicationId, { fit });
  await addEvent({
    applicationId,
    type: "fit",
    title: `Fit analysis: ${fit.overall}${fit.score !== undefined ? ` (${fit.score}% of must-haves)` : ""}`,
    body: fit.summary,
    touch: false,
  });
  return fit;
}

export async function recomputeFit(applicationId: string): Promise<FitAnalysis> {
  const bundle = await getApplicationBundle(applicationId);
  if (!bundle) throw new Error("Application not found");
  if (!bundle.posting) throw new Error("This application has no parsed posting to compare against.");
  const profile = await getProfile();
  if (!profile) throw new Error("Import or create your master profile first.");
  return runFit(applicationId, profile, bundle.posting.parsed);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(input: {
  applicationId?: string | null;
  kind: DocumentKind;
  buffer: Buffer;
  filename: string;
  mime?: string | null;
  title?: string | null;
  extractedText?: string | null;
}): Promise<DocumentRow> {
  const mime = detectMime(input.filename, input.mime);
  const extracted = input.extractedText ?? (await extractText(input.buffer, mime));
  const key = newStorageKey(input.filename);
  await getStorage().put(key, input.buffer, mime);
  const db = await getDb();
  const version = await nextDocumentVersion(input.applicationId ?? null, input.kind);
  const [row] = await db
    .insert(schema.documents)
    .values({
      userId: env.userId,
      applicationId: input.applicationId ?? null,
      kind: input.kind,
      title: input.title?.trim() || input.filename,
      filename: input.filename,
      storageKey: key,
      mime,
      sizeBytes: input.buffer.length,
      version,
      extractedText: extracted.slice(0, 200_000) || null,
    })
    .returning();
  if (input.applicationId) {
    await addEvent({
      applicationId: input.applicationId,
      type: "document",
      title: `Added document: ${row.title}`,
    });
  }
  return row;
}

export function renderResumePlainText(r: RenderableResume): string {
  const lines: string[] = [r.contact.name, r.headline, "", r.summary, "", "EXPERIENCE"];
  for (const w of r.work) {
    lines.push(`${w.title} — ${w.company} (${w.start ?? ""} – ${w.end ?? "Present"})`);
    for (const b of w.bullets) lines.push(`• ${b}`);
  }
  if (r.projects.length) {
    lines.push("", "PROJECTS");
    for (const p of r.projects) {
      lines.push(p.name);
      for (const b of p.bullets) lines.push(`• ${b}`);
    }
  }
  lines.push("", "EDUCATION");
  for (const e of r.education) lines.push(`${e.school} — ${[e.degree, e.field].filter(Boolean).join(", ")}`);
  lines.push("", "SKILLS", r.skills.join(", "));
  return lines.join("\n");
}

function contactLine(profile: Profile): string {
  return [profile.contact.email, profile.contact.phone, profile.contact.location, profile.contact.linkedin].filter(Boolean).join("  |  ");
}

export async function generateResumeForApplication(
  applicationId: string,
  instructions?: string | null,
): Promise<{ document: DocumentRow; tailored: TailoredResume }> {
  const bundle = await getApplicationBundle(applicationId);
  if (!bundle) throw new Error("Application not found");
  if (!bundle.posting) throw new Error("This application has no parsed posting.");
  const profile = await getProfile();
  if (!profile || profile.work.length === 0) throw new Error("Import or fill in your master profile (with at least one role) first.");

  const memories = memoryStrings(await loadMemories(applicationId));
  const tailored = await tailorResume({
    profile,
    posting: bundle.posting.parsed,
    fit: bundle.application.fit,
    instructions: instructions ?? undefined,
    memories,
    applicationId,
  });
  if (!tailored.rendered) throw new Error("Tailoring produced no renderable resume");

  const docx = await resumeToDocx(tailored.rendered);
  const version = await nextDocumentVersion(applicationId, "resume_tailored");
  const filename = `${slugify(profile.contact.name || "resume")}-${slugify(bundle.application.company)}-resume-v${version}.docx`;
  const key = newStorageKey(filename);
  await getStorage().put(key, docx, DOCX_MIME);

  const db = await getDb();
  const [document] = await db
    .insert(schema.documents)
    .values({
      userId: env.userId,
      applicationId,
      kind: "resume_tailored",
      title: `Resume for ${bundle.application.company} (v${version})`,
      filename,
      storageKey: key,
      mime: DOCX_MIME,
      sizeBytes: docx.length,
      version,
      extractedText: renderResumePlainText(tailored.rendered),
      generatedData: tailored,
      generationInput: {
        instructions: instructions ?? null,
        jobPostingId: bundle.posting.id,
        fitScore: bundle.application.fit?.score ?? null,
        model: env.aiMock ? "mock" : env.modelMain,
      },
    })
    .returning();

  await touchApplication(applicationId, { resumeDocumentId: document.id });
  await addEvent({ applicationId, type: "document", title: `Generated ${document.title}`, body: tailored.notes_for_user.join("\n") });
  return { document, tailored };
}

export async function generateCoverLetterForApplication(
  applicationId: string,
  instructions?: string | null,
): Promise<{ document: DocumentRow; letter: CoverLetter }> {
  const bundle = await getApplicationBundle(applicationId);
  if (!bundle) throw new Error("Application not found");
  if (!bundle.posting) throw new Error("This application has no parsed posting.");
  const profile = await getProfile();
  if (!profile || profile.work.length === 0) throw new Error("Import or fill in your master profile first.");

  const memories = memoryStrings(await loadMemories(applicationId));
  const letter = await writeCoverLetter({
    profile,
    posting: bundle.posting.parsed,
    fit: bundle.application.fit,
    instructions: instructions ?? undefined,
    memories,
    applicationId,
  });

  const name = profile.contact.name || "Candidate";
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const docx = await coverLetterToDocx({ name, contactLine: contactLine(profile), date, ...letter });
  const version = await nextDocumentVersion(applicationId, "cover_letter");
  const filename = `${slugify(name)}-${slugify(bundle.application.company)}-cover-letter-v${version}.docx`;
  const key = newStorageKey(filename);
  await getStorage().put(key, docx, DOCX_MIME);

  const db = await getDb();
  const [document] = await db
    .insert(schema.documents)
    .values({
      userId: env.userId,
      applicationId,
      kind: "cover_letter",
      title: `Cover letter for ${bundle.application.company} (v${version})`,
      filename,
      storageKey: key,
      mime: DOCX_MIME,
      sizeBytes: docx.length,
      version,
      extractedText: coverLetterToText(letter, name),
      generatedData: letter,
      generationInput: { instructions: instructions ?? null, jobPostingId: bundle.posting.id, date, model: env.aiMock ? "mock" : env.modelMain },
    })
    .returning();

  await touchApplication(applicationId, { coverLetterDocumentId: document.id });
  await addEvent({ applicationId, type: "document", title: `Generated ${document.title}` });
  return { document, letter };
}

/** Bytes for download. Generated documents can be rendered to PDF on demand. */
export async function documentBytes(
  doc: DocumentRow,
  format: "original" | "pdf" | "docx" = "original",
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const gen = doc.generatedData;
  if (gen && format === "pdf") {
    if (doc.kind === "resume_tailored" && "rendered" in gen && gen.rendered) {
      return { buffer: await resumeToPdf(gen.rendered), mime: "application/pdf", filename: doc.filename.replace(/\.docx$/i, ".pdf") };
    }
    if (doc.kind === "cover_letter" && "paragraphs" in gen) {
      const profile = await getProfile();
      const name = profile?.contact.name || "Candidate";
      const date = String(doc.generationInput?.date ?? new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
      const buffer = await coverLetterToPdf({ name, contactLine: profile ? contactLine(profile) : "", date, ...gen });
      return { buffer, mime: "application/pdf", filename: doc.filename.replace(/\.docx$/i, ".pdf") };
    }
  }
  if (!doc.storageKey) throw new Error("This document has no stored file.");
  return { buffer: await getStorage().get(doc.storageKey), mime: doc.mime, filename: doc.filename };
}

export async function documentPlainText(doc: DocumentRow): Promise<string> {
  if (doc.extractedText) return doc.extractedText;
  if (doc.storageKey) {
    const buffer = await getStorage().get(doc.storageKey);
    return extractText(buffer, doc.mime);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Profile import
// ---------------------------------------------------------------------------

export async function importProfileFromFile(input: {
  buffer: Buffer;
  filename: string;
  mime?: string | null;
}): Promise<Profile> {
  const mime = detectMime(input.filename, input.mime);
  const existing = (await getProfile()) ?? undefined;
  let profile: Profile;
  let extracted = "";
  if (isPdf(mime)) {
    extracted = await extractText(input.buffer, mime);
    profile = await importProfile({ pdfBase64: input.buffer.toString("base64"), text: extracted || undefined, existing });
  } else if (isDocx(mime) || mime.startsWith("text/")) {
    extracted = await extractText(input.buffer, mime);
    if (!extracted) throw new Error("Could not read any text from that file.");
    profile = await importProfile({ text: extracted, existing });
  } else {
    throw new Error("Upload a PDF, DOCX, or plain-text resume.");
  }
  const doc = await uploadDocument({
    kind: "resume_master",
    buffer: input.buffer,
    filename: input.filename,
    mime,
    title: `Master resume: ${input.filename}`,
    extractedText: extracted,
  });
  await saveProfile(profile, doc.id);
  return profile;
}

export async function importProfileFromText(text: string): Promise<Profile> {
  const existing = (await getProfile()) ?? undefined;
  const profile = await importProfile({ text, existing });
  await saveProfile(profile);
  return profile;
}

export async function setApplicationStatus(applicationId: string, status: ApplicationRow["status"]): Promise<void> {
  const db = await getDb();
  const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, applicationId));
  if (!app) throw new Error("Application not found");
  if (app.status === status) return;
  await touchApplication(applicationId, {
    status,
    ...(status === "applied" && !app.appliedAt ? { appliedAt: new Date() } : {}),
  });
  await addEvent({ applicationId, type: "status_change", title: `Status: ${app.status} → ${status}`, payload: { from: app.status, to: status } });
}
