import { z } from "zod";

// ---------------------------------------------------------------------------
// Master profile (source of truth for every generated document)
// ---------------------------------------------------------------------------

export const ContactSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedin: z.string().nullable(),
  website: z.string().nullable(),
});

export const BulletSchema = z.object({
  id: z.string().describe("Stable id, assigned by the app"),
  text: z.string(),
});

export const WorkSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  start: z.string().nullable().describe("YYYY-MM"),
  end: z.string().nullable().describe("YYYY-MM, or null if current"),
  bullets: z.array(BulletSchema),
});

export const EducationSchema = z.object({
  id: z.string(),
  school: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  notes: z.string().nullable(),
});

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
});

export const CertificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  bullets: z.array(BulletSchema),
});

export const RemotePolicySchema = z.enum(["onsite", "hybrid", "remote", "any", "unknown"]);

export const PreferencesSchema = z.object({
  targetTitles: z.array(z.string()),
  locations: z.array(z.string()),
  remote: RemotePolicySchema,
  compFloor: z.number().nullable(),
  compCurrency: z.string().nullable(),
  visaNotes: z.string().nullable(),
  earliestStart: z.string().nullable(),
  dealbreakers: z.array(z.string()),
  notes: z.string().nullable(),
});

export const ProfileSchema = z.object({
  contact: ContactSchema,
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  work: z.array(WorkSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillSchema),
  certifications: z.array(CertificationSchema),
  projects: z.array(ProjectSchema),
  preferences: PreferencesSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

export function emptyProfile(): Profile {
  return {
    contact: { name: "", email: null, phone: null, location: null, linkedin: null, website: null },
    headline: null,
    summary: null,
    work: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    preferences: {
      targetTitles: [],
      locations: [],
      remote: "any",
      compFloor: null,
      compCurrency: null,
      visaNotes: null,
      earliestStart: null,
      dealbreakers: [],
      notes: null,
    },
  };
}

// The model produces a draft without ids; the app assigns stable ids afterwards.
export const ProfileDraftSchema = z.object({
  contact: ContactSchema,
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  work: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(EducationSchema.omit({ id: true })),
  skills: z.array(z.object({ name: z.string(), category: z.string().nullable() })),
  certifications: z.array(CertificationSchema.omit({ id: true })),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
});
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

export function assignProfileIds(draft: ProfileDraft, existing?: Profile): Profile {
  const base = existing ?? emptyProfile();
  return {
    contact: draft.contact,
    headline: draft.headline,
    summary: draft.summary,
    work: draft.work.map((w, wi) => ({
      id: `w${wi + 1}`,
      company: w.company,
      title: w.title,
      location: w.location,
      start: w.start,
      end: w.end,
      bullets: w.bullets.map((text, bi) => ({ id: `w${wi + 1}b${bi + 1}`, text })),
    })),
    education: draft.education.map((e, i) => ({ id: `e${i + 1}`, ...e })),
    skills: draft.skills.map((s, i) => ({ id: `s${i + 1}`, ...s })),
    certifications: draft.certifications.map((c, i) => ({ id: `c${i + 1}`, ...c })),
    projects: draft.projects.map((p, pi) => ({
      id: `p${pi + 1}`,
      name: p.name,
      description: p.description,
      bullets: p.bullets.map((text, bi) => ({ id: `p${pi + 1}b${bi + 1}`, text })),
    })),
    preferences: base.preferences,
  };
}

// ---------------------------------------------------------------------------
// Job posting (normalized from URL, PDF, or pasted text)
// ---------------------------------------------------------------------------

export const JobPostingSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  remote_policy: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  employment_type: z.string().nullable().describe("full-time, contract, internship, etc."),
  comp_min: z.number().nullable(),
  comp_max: z.number().nullable(),
  comp_currency: z.string().nullable(),
  comp_source: z.enum(["stated", "estimated", "none"]),
  must_haves: z.array(z.string()).describe("Hard requirements, one per item, verbatim where possible"),
  nice_to_haves: z.array(z.string()),
  responsibilities: z.array(z.string()),
  posted_at: z.string().nullable().describe("YYYY-MM-DD if stated"),
  closes_at: z.string().nullable().describe("YYYY-MM-DD if stated"),
  apply_url: z.string().nullable(),
  ats: z.enum(["greenhouse", "lever", "ashby", "workday", "linkedin", "indeed", "other", "unknown"]),
  summary: z.string().describe("Two or three sentences on the role"),
  confidence_notes: z.array(z.string()).describe("Anything unclear or inferred"),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

// ---------------------------------------------------------------------------
// Fit analysis
// ---------------------------------------------------------------------------

export const FitRequirementSchema = z.object({
  requirement: z.string(),
  kind: z.enum(["must_have", "nice_to_have"]),
  status: z.enum(["met", "partial", "not_met"]),
  evidence: z.string().nullable().describe("Quoted or closely paraphrased from the profile"),
  gap_advice: z.string().nullable(),
});

export const FitAnalysisSchema = z.object({
  overall: z.enum(["strong", "good", "partial", "weak"]),
  summary: z.string(),
  requirements: z.array(FitRequirementSchema),
  questions_before_applying: z.array(z.string()),
  red_flags: z.array(z.string()),
});
export type FitAnalysis = z.infer<typeof FitAnalysisSchema> & { score?: number; computedAt?: string };

export function fitScore(fit: Pick<FitAnalysis, "requirements">): number {
  const must = fit.requirements.filter((r) => r.kind === "must_have");
  const pool = must.length > 0 ? must : fit.requirements;
  if (pool.length === 0) return 0;
  const points = pool.reduce(
    (acc, r) => acc + (r.status === "met" ? 1 : r.status === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((points / pool.length) * 100);
}

// ---------------------------------------------------------------------------
// Tailored resume (selection, reordering, rewording; never invention)
// ---------------------------------------------------------------------------

export const TailoredResumeSchema = z.object({
  headline: z.string(),
  summary: z.string().describe("Rewritten summary. Every claim must be supported by the master profile."),
  work: z.array(
    z.object({
      work_id: z.string().describe("id of the work entry in the master profile"),
      bullets: z.array(
        z.object({
          source_bullet_id: z.string().describe("id of the master bullet this is derived from"),
          text: z.string().describe("Reworded bullet. Same facts, no new claims."),
        }),
      ),
    }),
  ),
  skills: z.array(z.string()).describe("Subset of master skills, most relevant first"),
  projects: z.array(
    z.object({
      project_id: z.string(),
      bullets: z.array(z.object({ source_bullet_id: z.string(), text: z.string() })),
    }),
  ),
  notes_for_user: z.array(z.string()).describe("What changed and why, briefly"),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema> & {
  rendered?: RenderableResume;
};

/** Fully materialized resume ready for rendering. */
export interface RenderableResume {
  contact: Profile["contact"];
  headline: string;
  summary: string;
  work: Array<{
    company: string;
    title: string;
    location: string | null;
    start: string | null;
    end: string | null;
    bullets: string[];
  }>;
  education: Profile["education"];
  skills: string[];
  certifications: Profile["certifications"];
  projects: Array<{ name: string; description: string | null; bullets: string[] }>;
}

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

export const CoverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  closing: z.string(),
  claims: z.array(
    z.object({
      claim: z.string(),
      source: z
        .string()
        .describe(
          "Where the claim comes from: a bullet id like w1b2, 'summary', 'skill:<name>', 'education:<id>', 'certification:<id>', or 'project:<id>'",
        ),
    }),
  ),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

// ---------------------------------------------------------------------------
// Memory extraction and coach note
// ---------------------------------------------------------------------------

export const MemoryExtractionSchema = z.object({
  new_memories: z.array(
    z.object({
      kind: z.enum(["preference", "constraint", "fact", "insight", "decision"]),
      content: z.string().describe("One sentence, third person, specific"),
      scope: z.enum(["global", "application"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  superseded_memory_ids: z.array(z.string()),
});
export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export const CoachNoteSchema = z.object({
  note: z.string().describe("Three to five sentences, direct, specific to the pipeline"),
  top_actions: z.array(
    z.object({
      action: z.string(),
      application_id: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});
export type CoachNote = z.infer<typeof CoachNoteSchema> & { generatedAt?: string };
