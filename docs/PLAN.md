# AI Job Application Assistant — Product and Technical Plan (v1)

Status: draft for discussion, 2026-10-27. Working document; nothing here is built yet.

## 1. What this is

A personal job-search system of record where the AI is a first-class user of the database.
It reads and writes application records, documents, and a private memory, and it generates
tailored application materials from a verified master profile.

The core insight: the pain you feel with Claude Projects is structural, not a prompting problem.
Chat is a bad database. The fix is to make the **application record** the center of the product
and make chat one of several ways to read and write that record. Every feature you listed hangs
off that one object:

| Your feature | What it becomes |
|---|---|
| Track applications | Structured `applications` table with status, events, deadlines, contacts |
| AI reads any job posting (URL or PDF) | Ingestion pipeline that normalizes a posting into a `job_postings` schema |
| Edit resumes and cover letters per job | Generation from a structured master profile, with provenance checks and version history |
| Store artifacts (per application or global) | `documents` with an optional `application_id`; null means global |
| Home screen recommendations | Rules over the structured state, plus a short daily AI coach note |
| Chat linked to an application, with hidden memory | Tool-using chat whose context is the record plus scoped memories |
| Scour the web for postings | Saved searches over legal, free sources first; LinkedIn last |

## 2. Assessment

**What is strong**

- Real, personally felt problem, and you are user zero. You will know within a week whether it works.
- The six features cohere around one object, so the architecture stays simple.
- Grounded document generation from a verified profile is a real edge over "paste your resume into a chatbot."
  Most tools either keyword-stuff or hallucinate experience. Provenance-checked tailoring is the differentiator.

**What is hard, in order**

1. **Capture friction.** This is the riskiest assumption. If logging an application takes more than
   about twenty seconds, people stop logging, and every downstream feature starves. Capture must be
   "paste a link or PDF, done." Chat should also be able to create an application from "I just applied to X."
2. **Posting ingestion from URLs.** LinkedIn, Indeed, Workday, and many career sites sit behind
   JavaScript rendering, logins, or bot walls. URL fetch is best-effort. PDF and pasted text are reliable
   and must be first-class, not fallbacks.
3. **Document fidelity.** Editing a user's DOCX in place while preserving formatting is a rabbit hole.
   Generate from structured data instead.
4. **Memory correctness and scoping.** A wrong memory ("not open to relocation") silently poisons every
   later recommendation. Memories need provenance, confidence, scope, and a way to delete them.
5. **Job discovery sourcing.** The most expensive, least differentiated, and legally murkiest piece.
   Build it last and start with legal, free sources.
6. **Cost control.** Each application costs roughly $0.30 to $0.50 in model calls (section 8).
   Fine for one user, needs caps for many.

**Traps to avoid**

- Chat-first design. Chat is how you got into this mess. Chat is an input method, not the product.
- Building the scraper first. It feels like the "AI magic," but it is plumbing with legal risk.
- Editing DOCX files in place.
- A single opaque fit score. Show requirement-by-requirement evidence with gaps.
- Invisible memory. Keep it out of the main UI, but give the user a settings page to review and delete.
  Otherwise bad memories cannot be corrected, and if this ever has other users, invisible profiling is a liability.

## 3. V1 scope

**In v1**

- Master profile: import from an existing resume (PDF or DOCX) into structured data; edit in a form.
- Applications: create from URL, PDF, pasted text, or chat. Kanban by status. Events timeline. Next action and due date.
- Posting ingestion: normalize into a schema (title, company, location, remote policy, comp, must-haves, nice-to-haves, responsibilities, deadline, apply URL, source).
- Fit analysis: per-requirement met / partial / not met with evidence from the profile, plus gap advice.
- Tailored resume and cover letter: generated from the master profile, provenance-checked, rendered to DOCX and PDF, versioned per application. Diff view against the master.
- Artifacts: upload any file to an application or to the global library. Versioning. Text extraction for search.
- Chat: linked to an application or global. Tools let it read and write applications, documents, profile, and memory. It can create a new application mid-conversation.
- Memory: extracted asynchronously after each conversation into typed facts with scope and provenance. Loaded into context by scope. Reviewable in settings.
- Home: Do today (follow-ups due, deadlines, interviews), Needs attention (stale applications), Pipeline summary, a short daily coach note.

**Later (v2)**

- Job discovery: saved searches over ATS public boards, aggregator APIs, USAJobs; nightly scoring; "new matches" feed.
- Browser extension for one-click capture from any site, including LinkedIn while logged in as the user.
- Email forwarding to log recruiter correspondence.
- Interview prep packs, offer comparison, salary negotiation drafts.
- Multi-user hardening and billing (schema is multi-tenant from day one, so this is additive).

**Not planned**

- Auto-applying on the user's behalf. Legally and ethically messy, and it removes the user's judgment.
- Scraping LinkedIn server-side.

## 4. Architecture

Recommended stack (web first):

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router, TypeScript) on Vercel | One codebase for UI and API; fast to ship; server actions for tool-backed mutations |
| Database, auth, files | Supabase (Postgres, Auth, Storage, Row Level Security) | Everything in one place; RLS gives multi-tenant safety for free; pgvector available later |
| Model | Anthropic TypeScript SDK. `claude-opus-5-5` for chat, fit analysis, and tailoring. `claude-haiku-5-5` for posting parsing, memory extraction, and nightly scoring | Opus for anything the user reads; Haiku for high-volume extraction. Adaptive thinking on; structured outputs via `output_config.format`; prompt caching on the profile prefix |
| Agent loop | SDK Tool Runner (`betaZodTool` + `client.beta.messages.toolRunner`) | Handles the request, execute, loop cycle; per-turn hooks for approval of write tools |
| Fetching | Server-side fetch plus a readability extractor; Playwright worker as fallback (small Fly.io or Railway box, or Browserless) | Vercel functions cannot run Chromium well. Claude's server-side `web_fetch` tool is an alternative for simple pages |
| Documents | `mammoth` (DOCX to text) and Claude native PDF input for import; `docx` package for DOCX output; PDF via headless print or `@react-pdf/renderer` | Generate from data, never edit files in place |
| Background jobs | Inngest or Trigger.dev (both run on Vercel), or Supabase pg_cron for simple schedules | Memory extraction after chats, daily coach note, nightly searches |
| Embeddings | None in v1. Add Voyage AI plus pgvector when memories exceed a few hundred | Memories are small; load by scope and let the model pick what matters |

Request flows:

- **Capture**: user pastes URL, drops a PDF, or pastes text. Server fetches or extracts text, sends to Haiku with the posting schema, stores `job_postings` row and creates an `applications` row in status Saved. Fit analysis runs immediately on Opus and attaches to the application.
- **Tailor**: user clicks Tailor resume. Opus receives the master profile (cached prefix), the parsed posting, and the fit breakdown, and returns a tailored resume as structured data where every bullet carries the id of the master bullet it came from. Server verifies every id exists, rejects anything unsourced, renders DOCX and PDF, stores a versioned document, and shows a diff.
- **Chat**: each message is a Tool Runner session with the system prompt (cached), the profile, the linked application bundle if any, scoped memories, and the last N messages. Write tools require a confirmation step in the UI. After the conversation goes idle, a background job extracts memories.
- **Home**: computed from the database on load (rules), plus a daily coach note generated once per day per user and cached.

## 5. Data model

All tables carry `user_id` and are protected by Row Level Security, so single-user today becomes multi-user without a migration.

| Table | Key fields | Notes |
|---|---|---|
| `profiles` | contact, summary, `work_history[]` (each bullet has a stable id), `education[]`, `skills[]`, `certifications[]`, preferences (target titles, locations, remote, comp floor, visa status, start date), dealbreakers | The master profile. Source of truth for every generated document |
| `job_postings` | `source_url`, `source_kind` (url, pdf, paste, search), `raw_text`, `parsed` JSON (schema in section 6.1), `content_hash`, `fetched_at` | Deduplicated by hash and fuzzy company plus title |
| `applications` | `job_posting_id`, company, title, status (saved, applying, applied, screening, interviewing, offer, rejected, withdrawn, ghosted), `applied_at`, `next_action`, `next_action_due`, `fit` JSON, `resume_document_id`, `cover_letter_document_id`, source | The center of the product |
| `application_events` | `application_id`, type (status_change, note, email, interview, follow_up, reminder), `occurred_at`, payload | Timeline. Status changes are events, so history is free |
| `contacts` | `application_id`, name, role, email, LinkedIn URL | Recruiters and interviewers |
| `documents` | `application_id` (nullable means global), kind (resume_master, resume_tailored, cover_letter, portfolio, reference, offer, email, other), `storage_key`, mime, version, `parent_document_id`, `extracted_text`, `generation_input` JSON | Versioned. Generated documents keep the inputs that produced them |
| `conversations` | `application_id` (nullable), title | Chat threads |
| `messages` | `conversation_id`, role, content JSON, tool calls and results | Full content blocks are stored so thinking and tool state replay correctly |
| `memories` | kind (preference, constraint, fact, insight, decision), content, scope (global or `application_id`), `source_conversation_id`, confidence, `superseded_by`, `last_used_at` | Written by the extraction job, never directly by chat |
| `saved_searches` (v2) | query JSON (titles, locations, remote, comp, companies, exclusions), cadence | Drives discovery |
| `search_results` (v2) | `saved_search_id`, `job_posting_id`, score, `seen_at`, dismissed | New matches feed |

## 6. AI pipelines

### 6.1 Posting ingestion

Ladder, in order of reliability: pasted text, PDF, URL via plain fetch plus readability, URL via headless
browser, then ask the user to paste or print to PDF. PDFs go to the model directly as a document block.

Output schema (structured output, Haiku):

```
title, company, location, remote_policy (onsite|hybrid|remote|unknown),
employment_type, comp_min, comp_max, comp_currency, comp_source (stated|estimated|none),
must_haves[], nice_to_haves[], responsibilities[], posted_at, closes_at,
apply_url, ats (greenhouse|lever|ashby|workday|linkedin|other), confidence_notes[]
```

Deduplicate by content hash, then by fuzzy match on company plus title so a re-pasted posting
attaches to the existing application instead of creating a second one.

### 6.2 Fit analysis

Opus receives the profile and the parsed posting and returns, for each must-have and nice-to-have:

```
{ requirement, status: met|partial|not_met, evidence: "quoted from the profile", gap_advice }
```

plus a short overall verdict and three questions the user should answer before applying.
The UI shows "7 of 9 must-haves met" with the breakdown. A single number is shown only as a
summary of that breakdown, never computed on its own.

### 6.3 Tailoring with provenance

Resume tailoring is selection, reordering, and rewording of master bullets, never invention.
The model returns structured data where every bullet carries `source_bullet_id`. The server
validates each id against the profile and rejects the output if any bullet is unsourced.
The user sees a diff against the master and approves before anything is saved.

Cover letters follow the same rule for factual claims and draw tone from memories of the user's
writing samples when available.

Both are rendered to DOCX and PDF from templates. The user never edits a generated file in the app;
they regenerate with instructions, or download and edit elsewhere.

### 6.4 Chat agent

Tools, each with `strict: true` schemas:

- Read: `get_profile`, `list_applications`, `get_application` (posting, events, documents, fit), `search_documents`, `get_document_text`
- Write (confirmation required in UI): `create_application`, `update_application_status`, `add_event`, `set_next_action`, `attach_note`, `generate_tailored_resume`, `generate_cover_letter`, `update_profile_field`
- Memory: none exposed to the model. Memory is read by the server when building context and written only by the extraction job.

Context assembly per request: stable system prompt and profile under one cache breakpoint; then
the linked application bundle; then scoped memories; then recent messages. Volatile data such as
timestamps goes last so the cache prefix stays intact.

### 6.5 Memory

- Extraction runs after a conversation has been idle for a few minutes (Haiku, structured output).
  It proposes new facts with kind, scope, confidence, and the message that supports them, and marks
  any existing fact it contradicts as superseded.
- Scope rules: global facts (preferences, constraints, skills, history) are loaded in every chat.
  Application-scoped facts are loaded only in that application's chats. Cross-application insights
  ("rejections cluster at the take-home stage") are produced by a weekly summary job as global insights.
- v1 retrieval is "load everything in scope," which is fine while memories number in the hundreds.
  Add embeddings when that stops being true.
- Not shown on the home screen or in chat. A settings page lists memories with their source and a
  delete button. This is the one place I would push back on "not viewable": invisible memory cannot be corrected.

### 6.6 Home screen

Deterministic rules first, because they are cheap and explainable:

- Follow-up due: applied N days ago with no event since (default 7, then 14).
- Deadline approaching: `closes_at` within 3 days and status still Saved or Applying.
- Interview this week: any interview event in the next 7 days, with a link to a prep chat.
- Stale: no event in 21 days; suggest follow-up or mark Ghosted.
- Missing materials: Applying with no tailored resume attached.

Then one short daily coach note from Opus over the structured state (counts, recent events,
upcoming items), generated once per day and cached. No open-ended "recommendations" without a rule or a fact behind them.

### 6.7 Job discovery (v2)

Current reality, checked 2026-10-27:

- LinkedIn has no self-serve API for searching or reading job postings. The official Job Posting API
  is for publishing jobs and is partner-gated. Every third-party "LinkedIn jobs API" is a scraper or a
  dataset wrapping public pages, and scraping conflicts with LinkedIn's terms. Treat LinkedIn as
  "user captures it themselves," ideally via a browser extension that acts as the logged-in user.
- Legal and free: ATS public job boards (Greenhouse, Lever, Ashby expose company job lists without
  auth), USAJobs API, Adzuna (free API key). These cover a target-company watchlist well.
- Paid aggregators: JSearch (Google for Jobs data, free tier then from about $25/month),
  Fantastic.jobs (pulls from employer career sites, per-job pricing), SerpAPI Google Jobs.

Plan: saved searches run nightly through ATS boards for the user's watchlist companies plus one
aggregator, new postings are parsed with Haiku through the Batch API at half price, scored against
the profile, and surfaced as New matches with a one-click Save to applications.

## 7. Guardrails and privacy

- No fabricated experience: provenance ids on every generated bullet, validated in code, not by prompt alone.
- Write tools in chat require explicit confirmation in the UI.
- Memory has provenance, scope, confidence, and a delete path.
- Handle the `refusal` stop reason on Opus 5.5 and enable the server-side default fallback so a
  safety classifier false positive degrades gracefully instead of failing the request.
- Per-user monthly token budget with a soft warning and a hard cap.
- Row Level Security on every table from day one.
- Uploaded files are private objects; signed URLs with short expiry.

## 8. Cost estimate

Rough, at Anthropic list prices as of October 2026 (Opus 5.5 $4 in / $20 out per million tokens,
cache reads $0.20; Haiku 5.5 $0.10 / $0.50). Assumes the profile prefix is cached.

| Step | Model | Approx. cost |
|---|---|---|
| Parse posting | Haiku | $0.001 |
| Fit analysis | Opus | $0.04 |
| Tailored resume | Opus | $0.08 |
| Cover letter | Opus | $0.03 |
| Chat, ten turns | Opus | $0.20 |
| Memory extraction | Haiku | $0.001 |
| **Per application** | | **about $0.35** |

| Usage | Monthly |
|---|---|
| 40 applications | about $15 |
| Nightly discovery, 300 postings scored (v2, Batch API) | about $1.50 |
| Daily coach note | about $1 |

Using Sonnet 5.5 for chat roughly halves the chat line; that is a product decision, not a default.

## 9. Build order

1. **Foundation**: Next.js plus Supabase scaffold, auth, profile import from PDF or DOCX, profile editor.
2. **Track and ingest**: applications CRUD, kanban, events, capture from URL, PDF, and paste, fit analysis.
3. **Materials**: tailored resume and cover letter with provenance check, DOCX and PDF rendering, versioned documents, global library.
4. **Chat and memory**: tool-using chat, confirmation flow for writes, memory extraction job, memory settings page.
5. **Home**: rules engine, daily coach note, reminders.
6. **Discovery (v2)**: ATS board watchlist, one aggregator, nightly scoring, new matches feed.
7. **Later**: browser extension, email forwarding, interview prep, offer comparison, billing.

Steps 1 and 2 together make something you can use for your own search; that is the first milestone to aim for.

## 10. Decisions needed

1. Platform: web first (recommended), mobile first, or both from day one.
2. Tenancy: just you first with a multi-tenant schema (recommended), or full multi-user onboarding from the start.
3. Resume approach: generate from a structured master profile (recommended), or attempt in-place DOCX editing.
4. Hosting: Vercel plus Supabase (recommended), or something you already run.

## Sources

- https://jobspipe.dev/answers/does-linkedin-have-a-jobs-api.md
- https://apiserpent.com/blog/official-linkedin-api-vs-scraping
- https://learn.microsoft.com/en-in/linkedin/talent/release-notes
- https://cufinder.io/blog/api/best-job-postings-apis/
- https://publicapis.io/best/jobs
