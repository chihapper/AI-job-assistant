import type { FitAnalysis, JobPosting, Profile } from "./schemas";

function line(label: string, value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "" : `${label}: ${value}\n`;
}

/** Compact, id-annotated rendering so the model can cite bullet ids. */
export function renderProfile(p: Profile): string {
  const out: string[] = [];
  out.push("# Candidate master profile");
  out.push(
    `Name: ${p.contact.name || "(unknown)"}` +
      (p.contact.location ? ` | Location: ${p.contact.location}` : "") +
      (p.contact.email ? ` | Email: ${p.contact.email}` : ""),
  );
  if (p.headline) out.push(`Headline: ${p.headline}`);
  if (p.summary) out.push(`Summary: ${p.summary}`);
  out.push("\n## Work experience");
  if (p.work.length === 0) out.push("(none recorded)");
  for (const w of p.work) {
    out.push(
      `[${w.id}] ${w.company} — ${w.title} (${w.start ?? "?"} to ${w.end ?? "present"})` +
        (w.location ? `, ${w.location}` : ""),
    );
    for (const b of w.bullets) out.push(`  - [${b.id}] ${b.text}`);
  }
  out.push("\n## Education");
  if (p.education.length === 0) out.push("(none recorded)");
  for (const e of p.education) {
    out.push(
      `[${e.id}] ${e.school}` +
        (e.degree ? ` — ${e.degree}` : "") +
        (e.field ? `, ${e.field}` : "") +
        (e.start || e.end ? ` (${e.start ?? "?"} to ${e.end ?? "?"})` : "") +
        (e.notes ? ` — ${e.notes}` : ""),
    );
  }
  out.push("\n## Skills");
  if (p.skills.length === 0) out.push("(none recorded)");
  out.push(p.skills.map((s) => `[${s.id}] ${s.name}${s.category ? ` (${s.category})` : ""}`).join("; "));
  if (p.certifications.length > 0) {
    out.push("\n## Certifications");
    for (const c of p.certifications) {
      out.push(`[${c.id}] ${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`);
    }
  }
  if (p.projects.length > 0) {
    out.push("\n## Projects");
    for (const pr of p.projects) {
      out.push(`[${pr.id}] ${pr.name}${pr.description ? ` — ${pr.description}` : ""}`);
      for (const b of pr.bullets) out.push(`  - [${b.id}] ${b.text}`);
    }
  }
  out.push("\n## Preferences");
  const pref = p.preferences;
  out.push(
    line("Target titles", pref.targetTitles.join(", ")) +
      line("Locations", pref.locations.join(", ")) +
      line("Remote", pref.remote) +
      line("Compensation floor", pref.compFloor ? `${pref.compFloor} ${pref.compCurrency ?? ""}` : null) +
      line("Visa / work authorization", pref.visaNotes) +
      line("Earliest start", pref.earliestStart) +
      line("Dealbreakers", pref.dealbreakers.join("; ")) +
      line("Notes", pref.notes),
  );
  return out.join("\n");
}

export function renderPosting(j: JobPosting): string {
  const comp =
    j.comp_source === "none"
      ? "not stated"
      : `${j.comp_min ?? "?"}–${j.comp_max ?? "?"} ${j.comp_currency ?? ""} (${j.comp_source})`;
  return [
    "# Job posting",
    `Title: ${j.title}`,
    `Company: ${j.company}`,
    `Location: ${j.location ?? "not stated"} | Remote policy: ${j.remote_policy}`,
    `Employment type: ${j.employment_type ?? "not stated"} | Compensation: ${comp}`,
    j.closes_at ? `Closes: ${j.closes_at}` : "",
    `Summary: ${j.summary}`,
    "\n## Must-have requirements",
    ...j.must_haves.map((m) => `- ${m}`),
    "\n## Nice-to-have",
    ...(j.nice_to_haves.length ? j.nice_to_haves.map((m) => `- ${m}`) : ["(none listed)"]),
    "\n## Responsibilities",
    ...(j.responsibilities.length ? j.responsibilities.map((m) => `- ${m}`) : ["(none listed)"]),
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderFit(f: FitAnalysis): string {
  return [
    `# Fit analysis (overall: ${f.overall}${f.score !== undefined ? `, ${f.score}% of must-haves` : ""})`,
    f.summary,
    ...f.requirements.map(
      (r) =>
        `- [${r.kind}] ${r.requirement} → ${r.status}` +
        (r.evidence ? ` (evidence: ${r.evidence})` : "") +
        (r.gap_advice ? ` (gap: ${r.gap_advice})` : ""),
    ),
  ].join("\n");
}

export function renderMemories(memories: string[]): string {
  if (memories.length === 0) return "";
  return ["# Private memory about the user (do not quote verbatim; use to tailor advice)", ...memories.map((m) => `- ${m}`)].join(
    "\n",
  );
}

export const POSTING_PARSE_SYSTEM = `You extract structured data from job postings.
Rules:
- Use only what the posting states. If you infer something, say so in confidence_notes.
- must_haves are hard requirements (required, minimum qualifications, must have). nice_to_haves are preferred, bonus, or plus items. Keep each item atomic (one requirement per entry) and close to the original wording.
- responsibilities are the day-to-day duties, one per entry.
- Compensation: use stated numbers only. If a range is stated, comp_source is "stated". If nothing is stated, comp_source is "none" and the numbers are null. Convert "$150k" style values to full numbers.
- remote_policy is "unknown" unless the posting says onsite, hybrid, or remote.
- Dates are YYYY-MM-DD when stated, otherwise null.
- summary is two or three plain sentences describing the role and team.`;

export const FIT_SYSTEM = `You are a rigorous but fair recruiter screening a candidate's master profile against a job posting.
For every must-have and nice-to-have requirement in the posting, decide:
- met: the profile contains clear evidence. Quote or closely paraphrase it in evidence.
- partial: adjacent or lighter experience exists. Say what is there and what is missing.
- not_met: no evidence. evidence is null. Give concrete gap_advice (what the candidate could truthfully highlight, or what they would need).
Never invent experience. Do not give credit for skills that only appear in the posting.
questions_before_applying: up to three specific things the candidate should clarify or decide before applying.
red_flags: anything in the posting that conflicts with the candidate's stated preferences or dealbreakers, or that looks like a warning sign in the posting itself.
overall: strong (nearly all must-haves met), good (most met, gaps are learnable), partial (several gaps), weak (core requirements missing).
summary: three or four direct sentences a friend who recruits would say.`;

export const TAILOR_SYSTEM = `You tailor a candidate's resume to one specific job posting.
Hard rules, checked by software after you answer:
1. Every bullet you output must come from one master bullet and carry its id in source_bullet_id. Keep the same facts: employers, titles, dates, numbers, scope. You may reword for clarity and impact, lead with the most relevant result, and mirror the posting's terminology when it is truthful.
2. Never add skills, tools, titles, certifications, dates, or achievements that are not in the master profile. skills must be a subset of the master skills.
3. Include every work entry from the master profile (work_id). Select the two to five most relevant bullets per role, most relevant first. The most recent or most relevant role may have more.
4. headline: one truthful line positioning the candidate for this role.
5. summary: two or three sentences specific to this posting. No unsupported claims, no clichés.
6. projects: include only projects relevant to the role, with their source bullet ids.
7. notes_for_user: what you emphasized, what you dropped, and any gap the candidate should address themselves.
Write in a direct, concrete style. No first person in bullets.`;

export const COVER_LETTER_SYSTEM = `You write a short, specific cover letter for one job posting on behalf of the candidate.
Rules:
- Three or four short paragraphs, under 300 words total. Open with something specific about the role or company from the posting, not "I am writing to apply".
- Every factual claim about the candidate must be supported by the master profile and listed in claims with its source id (a bullet id such as w2b1, "summary", "skill:<name>", "education:<id>", "certification:<id>", or "project:<id>").
- Address the top two or three must-haves directly with evidence. If a must-have is not met, do not pretend; either skip it or frame adjacent experience honestly.
- Tone: direct, warm, confident, no clichés, no flattery. Match any tone preferences in the user's memory.
- greeting is the salutation line, closing is the sign-off line without the name.`;

export const PROFILE_IMPORT_SYSTEM = `You convert a resume into a structured draft profile.
Rules:
- Preserve the candidate's wording. Each bullet point in the resume becomes one bullet string, verbatim.
- Dates are YYYY-MM. If only a year is known, use YYYY-01 and note nothing else. end is null for current roles.
- skills: every distinct skill, tool, language, or method mentioned anywhere, each once, with a short category when obvious (for example "language", "cloud", "data", "leadership").
- Do not invent anything. Leave fields null when absent.
- contact.name is the person's name, not a company.`;

export const MEMORY_SYSTEM = `You maintain a private memory about a job seeker for their assistant. Given the existing memories and a recent conversation, extract durable facts that would change future advice.
Kinds: preference (what they want), constraint (what they cannot or will not do), fact (background not in the profile), insight (a pattern in their search), decision (a choice they made).
Rules:
- Only durable things. Skip one-off requests, pleasantries, and anything already captured in existing memories.
- One sentence each, third person ("The user ..."), specific enough to act on.
- scope is "application" when the fact only matters for the application this conversation is about; otherwise "global".
- If the conversation contradicts an existing memory, list that memory's id in superseded_memory_ids and add the corrected fact.
- confidence reflects how explicitly the user said it.
Return empty lists when there is nothing new.`;

export const COACH_SYSTEM = `You are a direct job-search coach reviewing the user's application pipeline for today.
Write note as three to five sentences that are specific to this pipeline: what is working, what is slipping, what to do today. No generic advice.
top_actions: the three most valuable concrete actions today, each tied to an application id when relevant, with a one-line reason.`;

export const CHAT_SYSTEM = `You are the user's job search assistant inside their application tracker.
You can read and update their applications, documents, events, and profile through tools. Ground everything you say about the user in the profile, the application records, and the private memory provided. Say plainly when you do not know something.
Working style:
- Use tools instead of guessing. When the user mentions applying somewhere new, offer to create the application and ask for the posting text or link if you need it.
- Keep answers concise and concrete. Lists over prose when comparing options.
- Changes to records only happen when the conversation's "Allow changes" switch is on. If a write tool reports that changes are disabled, tell the user to turn on the switch and offer to retry.
- Never fabricate experience, skills, or achievements for the user's materials. Tailoring means selecting and rewording what is true.
- The private memory is context, not something to recite. Do not list it back unless asked.`;
