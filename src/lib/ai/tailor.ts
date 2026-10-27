import { env } from "../env";
import { MODEL_MAIN, cachedSystem, callStructured, type MessageParam } from "./client";
import { mockCoverLetter, mockTailorResume } from "./mock";
import { COVER_LETTER_SYSTEM, TAILOR_SYSTEM, renderFit, renderMemories, renderPosting, renderProfile } from "./prompts";
import {
  CoverLetterSchema,
  TailoredResumeSchema,
  type CoverLetter,
  type FitAnalysis,
  type JobPosting,
  type Profile,
  type RenderableResume,
  type TailoredResume,
} from "./schemas";

// ---------------------------------------------------------------------------
// Provenance validation: the anti-fabrication guarantee lives here, in code.
// ---------------------------------------------------------------------------

function bulletIndex(profile: Profile): Map<string, { text: string; owner: string }> {
  const map = new Map<string, { text: string; owner: string }>();
  for (const w of profile.work) for (const b of w.bullets) map.set(b.id, { text: b.text, owner: w.id });
  for (const p of profile.projects) for (const b of p.bullets) map.set(b.id, { text: b.text, owner: p.id });
  return map;
}

export function validateTailoredResume(profile: Profile, t: TailoredResume): string[] {
  const errors: string[] = [];
  const bullets = bulletIndex(profile);
  const workIds = new Set(profile.work.map((w) => w.id));
  const projectIds = new Set(profile.projects.map((p) => p.id));
  const skillNames = new Set(profile.skills.map((s) => s.name.trim().toLowerCase()));

  for (const w of t.work) {
    if (!workIds.has(w.work_id)) errors.push(`work_id "${w.work_id}" does not exist in the master profile`);
    for (const b of w.bullets) {
      const src = bullets.get(b.source_bullet_id);
      if (!src) errors.push(`bullet source "${b.source_bullet_id}" does not exist`);
      else if (src.owner !== w.work_id) errors.push(`bullet "${b.source_bullet_id}" belongs to ${src.owner}, not ${w.work_id}`);
      if (!b.text.trim()) errors.push(`empty bullet text for "${b.source_bullet_id}"`);
    }
  }
  for (const p of t.projects) {
    if (!projectIds.has(p.project_id)) errors.push(`project_id "${p.project_id}" does not exist`);
    for (const b of p.bullets) {
      const src = bullets.get(b.source_bullet_id);
      if (!src) errors.push(`bullet source "${b.source_bullet_id}" does not exist`);
      else if (src.owner !== p.project_id) errors.push(`bullet "${b.source_bullet_id}" belongs to ${src.owner}, not ${p.project_id}`);
    }
  }
  for (const s of t.skills) {
    if (!skillNames.has(s.trim().toLowerCase())) errors.push(`skill "${s}" is not in the master profile`);
  }
  const missingWork = profile.work.filter((w) => !t.work.some((tw) => tw.work_id === w.id));
  if (missingWork.length > 0) errors.push(`missing work entries: ${missingWork.map((w) => w.id).join(", ")}`);
  return errors;
}

export function materializeResume(profile: Profile, t: TailoredResume): RenderableResume {
  const workById = new Map(profile.work.map((w) => [w.id, w]));
  const projectById = new Map(profile.projects.map((p) => [p.id, p]));
  const orderedWork = profile.work
    .map((w) => ({ master: w, tailored: t.work.find((tw) => tw.work_id === w.id) }))
    .filter((x): x is { master: Profile["work"][number]; tailored: TailoredResume["work"][number] } => Boolean(x.tailored));
  return {
    contact: profile.contact,
    headline: t.headline,
    summary: t.summary,
    work: orderedWork.map(({ master, tailored }) => ({
      company: master.company,
      title: master.title,
      location: master.location,
      start: master.start,
      end: master.end,
      bullets: tailored.bullets.map((b) => b.text),
    })),
    education: profile.education,
    skills: t.skills,
    certifications: profile.certifications,
    projects: t.projects
      .map((tp) => {
        const master = projectById.get(tp.project_id);
        return master
          ? { name: master.name, description: master.description, bullets: tp.bullets.map((b) => b.text) }
          : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
  };
  void workById;
}

export function validateCoverLetter(profile: Profile, cl: CoverLetter): string[] {
  const errors: string[] = [];
  const bullets = bulletIndex(profile);
  const skillNames = new Set(profile.skills.map((s) => s.name.trim().toLowerCase()));
  const eduIds = new Set(profile.education.map((e) => e.id));
  const certIds = new Set(profile.certifications.map((c) => c.id));
  const projectIds = new Set(profile.projects.map((p) => p.id));
  for (const c of cl.claims) {
    const src = c.source.trim();
    if (src === "summary" || src === "headline") continue;
    if (bullets.has(src)) continue;
    if (src.startsWith("skill:") && skillNames.has(src.slice(6).trim().toLowerCase())) continue;
    if (src.startsWith("education:") && eduIds.has(src.slice(10).trim())) continue;
    if (src.startsWith("certification:") && certIds.has(src.slice(14).trim())) continue;
    if (src.startsWith("project:") && projectIds.has(src.slice(8).trim())) continue;
    errors.push(`claim "${c.claim}" cites unknown source "${c.source}"`);
  }
  if (cl.paragraphs.length === 0) errors.push("no paragraphs");
  return errors;
}

// ---------------------------------------------------------------------------
// Generation with one corrective retry
// ---------------------------------------------------------------------------

export async function tailorResume(opts: {
  profile: Profile;
  posting: JobPosting;
  fit?: FitAnalysis | null;
  instructions?: string;
  memories?: string[];
  applicationId?: string | null;
}): Promise<TailoredResume> {
  let result: TailoredResume;
  if (env.aiMock) {
    result = mockTailorResume(opts.profile, opts.posting);
  } else {
    const userText = [
      renderPosting(opts.posting),
      opts.fit ? renderFit(opts.fit) : "",
      renderMemories(opts.memories ?? []),
      opts.instructions ? `# Extra instructions from the user\n${opts.instructions}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages: MessageParam[] = [{ role: "user", content: userText }];
    const system = [cachedSystem(`${TAILOR_SYSTEM}\n\n${renderProfile(opts.profile)}`)];
    result = await callStructured({
      model: MODEL_MAIN,
      purpose: "tailor_resume",
      applicationId: opts.applicationId,
      system,
      messages,
      schema: TailoredResumeSchema,
      effort: "high",
    });
    const errors = validateTailoredResume(opts.profile, result);
    if (errors.length > 0) {
      messages.push(
        { role: "assistant", content: JSON.stringify(result) },
        {
          role: "user",
          content: `Your output failed provenance validation:\n- ${errors.join("\n- ")}\nReturn a corrected version that uses only ids and skills from the master profile.`,
        },
      );
      result = await callStructured({
        model: MODEL_MAIN,
        purpose: "tailor_resume_retry",
        applicationId: opts.applicationId,
        system,
        messages,
        schema: TailoredResumeSchema,
        effort: "high",
      });
    }
  }
  const finalErrors = validateTailoredResume(opts.profile, result);
  if (finalErrors.length > 0) {
    throw new Error(`Tailored resume failed provenance checks: ${finalErrors.join("; ")}`);
  }
  return { ...result, rendered: materializeResume(opts.profile, result) };
}

export async function writeCoverLetter(opts: {
  profile: Profile;
  posting: JobPosting;
  fit?: FitAnalysis | null;
  instructions?: string;
  memories?: string[];
  applicationId?: string | null;
}): Promise<CoverLetter> {
  let result: CoverLetter;
  if (env.aiMock) {
    result = mockCoverLetter(opts.profile, opts.posting);
  } else {
    const userText = [
      renderPosting(opts.posting),
      opts.fit ? renderFit(opts.fit) : "",
      renderMemories(opts.memories ?? []),
      opts.instructions ? `# Extra instructions from the user\n${opts.instructions}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages: MessageParam[] = [{ role: "user", content: userText }];
    const system = [cachedSystem(`${COVER_LETTER_SYSTEM}\n\n${renderProfile(opts.profile)}`)];
    result = await callStructured({
      model: MODEL_MAIN,
      purpose: "cover_letter",
      applicationId: opts.applicationId,
      system,
      messages,
      schema: CoverLetterSchema,
      effort: "medium",
    });
    const errors = validateCoverLetter(opts.profile, result);
    if (errors.length > 0) {
      messages.push(
        { role: "assistant", content: JSON.stringify(result) },
        {
          role: "user",
          content: `Your output failed provenance validation:\n- ${errors.join("\n- ")}\nReturn a corrected letter whose claims cite only sources that exist in the master profile.`,
        },
      );
      result = await callStructured({
        model: MODEL_MAIN,
        purpose: "cover_letter_retry",
        applicationId: opts.applicationId,
        system,
        messages,
        schema: CoverLetterSchema,
        effort: "medium",
      });
    }
  }
  const finalErrors = validateCoverLetter(opts.profile, result);
  if (finalErrors.length > 0) {
    throw new Error(`Cover letter failed provenance checks: ${finalErrors.join("; ")}`);
  }
  return result;
}

export function coverLetterToText(cl: CoverLetter, name: string): string {
  return [cl.greeting, "", cl.paragraphs.join("\n\n"), "", cl.closing, name].join("\n");
}
