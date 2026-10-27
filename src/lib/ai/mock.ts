/**
 * Deterministic stand-ins used when no API key is configured (or AI_MOCK=1),
 * so every screen and flow can be exercised without spending tokens.
 */
import type {
  CoachNote,
  CoverLetter,
  FitAnalysis,
  JobPosting,
  MemoryExtraction,
  Profile,
  ProfileDraft,
  TailoredResume,
} from "./schemas";
import { fitScore } from "./schemas";

const HEADINGS = {
  must: /^(requirements?|qualifications?|minimum qualifications?|what you('|’)ll need|what we('|’)re looking for|must[- ]haves?|basic qualifications?)\b/i,
  nice: /^(preferred|nice[- ]to[- ]haves?|bonus|preferred qualifications?|plus)\b/i,
  resp: /^(responsibilities|what you('|’)ll do|the role|about the role|duties)\b/i,
  other: /^(about|benefits|compensation|perks|why|equal|how to apply|company)\b/i,
};

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*–·]+/, "").trim())
    .filter(Boolean);
}

export function mockParsePosting(text: string, sourceUrl?: string | null): JobPosting {
  const ls = lines(text);
  const titleLine = ls.find((l) => l.length < 90) ?? "Untitled role";
  const title = titleLine.replace(/^(job )?title\s*[:\-]\s*/i, "");
  const companyMatch =
    text.match(/(?:^|\n)\s*(?:company|employer)\s*[:\-]\s*(.+)/i) ??
    text.slice(0, 400).match(/\bat ([A-Z][\w&.'\- ]{1,40}?)(?=[\s.,;:!?)]|$)/m);
  const company = companyMatch?.[1]?.trim() ?? "Unknown company";
  const locationMatch = text.match(/location\s*[:\-]\s*(.+)/i);
  const remote = /\bremote\b/i.test(text) ? "remote" : /\bhybrid\b/i.test(text) ? "hybrid" : /on-?site/i.test(text) ? "onsite" : "unknown";

  const buckets = { must: [] as string[], nice: [] as string[], resp: [] as string[] };
  let current: keyof typeof buckets | null = null;
  for (const l of ls) {
    if (HEADINGS.must.test(l)) { current = "must"; continue; }
    if (HEADINGS.nice.test(l)) { current = "nice"; continue; }
    if (HEADINGS.resp.test(l)) { current = "resp"; continue; }
    if (HEADINGS.other.test(l)) { current = null; continue; }
    if (current && l.length > 8 && l.length < 220) buckets[current].push(l);
  }
  if (buckets.must.length === 0) {
    buckets.must = ls.filter((l) => /\b(\d\+?\s*years?|experience (with|in)|required|proficien)/i.test(l)).slice(0, 8);
  }

  const comp = text.match(/\$\s?(\d{2,3})(?:,(\d{3}))?\s?[kK]?\s?(?:-|–|to)\s?\$?\s?(\d{2,3})(?:,(\d{3}))?\s?[kK]?/);
  const toNum = (a?: string, b?: string) => (a ? Number(a) * (b ? 1000 : 1000) + (b ? Number(b) : 0) : null);
  const compMin = comp ? (comp[2] ? Number(comp[1] + comp[2]) : toNum(comp[1])) : null;
  const compMax = comp ? (comp[4] ? Number(comp[3] + comp[4]) : toNum(comp[3])) : null;

  return {
    title,
    company,
    location: locationMatch?.[1]?.trim() ?? null,
    remote_policy: remote,
    employment_type: /\bcontract\b/i.test(text) ? "contract" : /\bintern/i.test(text) ? "internship" : "full-time",
    comp_min: compMin,
    comp_max: compMax,
    comp_currency: comp ? "USD" : null,
    comp_source: comp ? "stated" : "none",
    must_haves: buckets.must.slice(0, 10),
    nice_to_haves: buckets.nice.slice(0, 8),
    responsibilities: buckets.resp.slice(0, 10),
    posted_at: null,
    closes_at: null,
    apply_url: sourceUrl ?? null,
    ats: sourceUrl?.includes("greenhouse") ? "greenhouse" : sourceUrl?.includes("lever.co") ? "lever" : sourceUrl?.includes("ashbyhq") ? "ashby" : "unknown",
    summary: `${title} at ${company}. Parsed in mock mode: requirement lists come from section headings, so review them.`,
    confidence_notes: ["Mock mode: no model call was made. Set ANTHROPIC_API_KEY for real parsing."],
  };
}

function profileText(p: Profile): string {
  return [
    p.summary ?? "",
    p.headline ?? "",
    ...p.work.flatMap((w) => [w.title, w.company, ...w.bullets.map((b) => b.text)]),
    ...p.skills.map((s) => s.name),
    ...p.projects.flatMap((pr) => [pr.name, ...pr.bullets.map((b) => b.text)]),
  ]
    .join(" \n")
    .toLowerCase();
}

export function mockAnalyzeFit(profile: Profile, posting: JobPosting): FitAnalysis {
  const haystack = profileText(profile);
  const judge = (req: string, kind: "must_have" | "nice_to_have") => {
    const words = req.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? [];
    const hits = words.filter((w) => haystack.includes(w));
    const ratio = words.length ? hits.length / words.length : 0;
    const status = ratio >= 0.5 ? "met" : ratio >= 0.25 ? "partial" : "not_met";
    return {
      requirement: req,
      kind,
      status: status as "met" | "partial" | "not_met",
      evidence: hits.length ? `Profile mentions: ${hits.slice(0, 4).join(", ")}` : null,
      gap_advice: status === "met" ? null : "Mock mode cannot judge this; review manually.",
    };
  };
  const requirements = [
    ...posting.must_haves.map((m) => judge(m, "must_have")),
    ...posting.nice_to_haves.map((m) => judge(m, "nice_to_have")),
  ];
  const partial = { overall: "partial" as const, summary: "", requirements, questions_before_applying: [], red_flags: [] };
  const score = fitScore(partial);
  const overall = score >= 80 ? "strong" : score >= 60 ? "good" : score >= 35 ? "partial" : "weak";
  return {
    ...partial,
    overall,
    summary: `Mock fit: ${score}% of must-haves matched by keyword overlap. This is a placeholder until an API key is configured.`,
    questions_before_applying: ["Is the compensation range acceptable?", "Does the location or remote policy work for you?"],
    red_flags: [],
    score,
    computedAt: new Date().toISOString(),
  };
}

export function mockTailorResume(profile: Profile, posting: JobPosting): TailoredResume {
  return {
    headline: profile.headline ?? `${posting.title} candidate`,
    summary: profile.summary ?? `Experienced professional applying for ${posting.title} at ${posting.company}.`,
    work: profile.work.map((w) => ({
      work_id: w.id,
      bullets: w.bullets.slice(0, 4).map((b) => ({ source_bullet_id: b.id, text: b.text })),
    })),
    skills: profile.skills.slice(0, 12).map((s) => s.name),
    projects: profile.projects.slice(0, 2).map((p) => ({
      project_id: p.id,
      bullets: p.bullets.slice(0, 2).map((b) => ({ source_bullet_id: b.id, text: b.text })),
    })),
    notes_for_user: ["Mock mode: bullets were copied unchanged (first four per role). Configure ANTHROPIC_API_KEY for real tailoring."],
  };
}

export function mockCoverLetter(profile: Profile, posting: JobPosting): CoverLetter {
  const first = profile.work[0];
  const bullet = first?.bullets[0];
  return {
    greeting: `Dear ${posting.company} hiring team,`,
    paragraphs: [
      `I am applying for the ${posting.title} role. ${posting.summary}`,
      first
        ? `Most recently I was ${first.title} at ${first.company}.${bullet ? ` ${bullet.text}` : ""}`
        : "My background is summarized in the attached resume.",
      "I would welcome the chance to discuss how my experience maps to your must-haves. (Mock mode: this letter is a template, not model-written.)",
    ],
    closing: "Sincerely,",
    claims: [
      ...(first ? [{ claim: `${first.title} at ${first.company}`, source: first.bullets[0]?.id ?? "summary" }] : []),
    ],
  };
}

export function mockImportProfile(text: string): ProfileDraft {
  const ls = lines(text);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[1]?.trim() ?? null;
  const linkedin = text.match(/linkedin\.com\/in\/[\w-]+/i)?.[0] ?? null;
  const name = ls.find((l) => l.length < 60 && !/@|http|\d{3}/.test(l)) ?? "Unknown";
  const bullets = ls.filter((l) => l.length > 30 && /^[A-Z]/.test(l) && !/@/.test(l)).slice(0, 8);
  const skillsLineIndex = ls.findIndex((l) => /^skills\b/i.test(l));
  const skills =
    skillsLineIndex >= 0
      ? (ls[skillsLineIndex].replace(/^skills\s*[:\-]?\s*/i, "") || ls[skillsLineIndex + 1] || "")
          .split(/[,|•]/)
          .map((s) => s.trim())
          .filter((s) => s && s.length < 40)
          .map((s) => ({ name: s, category: null }))
      : [];
  return {
    contact: { name, email, phone, location: null, linkedin, website: null },
    headline: null,
    summary: "Imported in mock mode: edit this profile by hand or configure ANTHROPIC_API_KEY and re-import.",
    work: [
      {
        company: "Imported role (edit me)",
        title: "Title",
        location: null,
        start: null,
        end: null,
        bullets,
      },
    ],
    education: [],
    skills,
    certifications: [],
    projects: [],
  };
}

export function mockExtractMemories(): MemoryExtraction {
  return { new_memories: [], superseded_memory_ids: [] };
}

export function mockCoachNote(summary: string): CoachNote {
  return {
    note: `Mock coach note. Pipeline snapshot: ${summary.slice(0, 200)}${summary.length > 200 ? "…" : ""}. Configure ANTHROPIC_API_KEY for a real daily note.`,
    top_actions: [],
    generatedAt: new Date().toISOString(),
  };
}

export function mockChatReply(userText: string, context: string): string {
  return `Mock mode is on (no ANTHROPIC_API_KEY configured), so I can't reason about "${userText.slice(0, 80)}" yet.\n\nWhat I can see right now:\n${context}\n\nAdd an API key to .env.local and restart to enable the real assistant.`;
}
