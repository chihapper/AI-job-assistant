# Job Assistant

A personal job-search system of record where the AI is a first-class user of the database. It tracks applications, reads postings from a link, pasted text, or PDF, scores fit against a verified master profile, generates tailored resumes and cover letters that cannot invent experience, keeps a private memory between chats, and tells you what to do today.

The product and technical plan, including the v2 roadmap (job discovery, browser extension), is in [docs/PLAN.md](docs/PLAN.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to leave mock mode
npm run dev                  # http://localhost:3000
```

That is the whole setup. With no `DATABASE_URL` the app uses an embedded Postgres (PGlite) under `./data`, and files are stored under `./data/files`. Migrations run automatically on first use.

Without an `ANTHROPIC_API_KEY` the app runs in **mock mode**: every screen and flow works, but parsing, fit, tailoring, and chat use deterministic placeholders. Add a key and restart to get the real assistant.

Suggested first steps in the app:

1. **Profile**: upload your current resume (PDF or DOCX). It becomes the structured master profile. Review the bullets and preferences; every generated document is built only from what is here.
2. **Capture a posting**: a link, pasted text, or a printed PDF. The posting is parsed, an application record is created, and a fit analysis runs.
3. **Materials**: on the application page, tailor a resume or write a cover letter. Download as DOCX or PDF.
4. **Chat**: ask about an application or your whole pipeline. Turn on "Allow changes" to let the assistant update records, log events, or generate materials.
5. **Home**: follow-ups due, deadlines, interviews this week, and a daily coach note.

## How it works

| Area | Implementation |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript), Tailwind CSS 4 |
| Database | Drizzle ORM. PGlite (embedded) by default, any Postgres via `DATABASE_URL` (Supabase works as-is) |
| Files | Local disk by default, Supabase Storage with `STORAGE_DRIVER=supabase` |
| Models | Anthropic TypeScript SDK. `claude-opus-5-5` for fit analysis, tailoring, cover letters, chat, and the coach note. `claude-haiku-5-5` for posting parsing and memory extraction. Structured outputs for every pipeline, prompt caching on the profile prefix, server-side refusal fallbacks |
| Chat | SDK Tool Runner with read tools (profile, applications, documents) and write tools (create application, status, events, next action, notes, generate materials). Writes are gated by a per-conversation switch |
| Memory | After each chat turn, durable facts are extracted into typed, scoped memories with provenance and confidence. They are loaded into context by scope and reviewable in Settings |
| Provenance | Tailored resumes carry a `source_bullet_id` on every bullet, validated in code against the master profile. Cover letter claims cite their source. Anything unsourced is rejected and regenerated once |
| Auth | Single-user password gate (`APP_PASSWORD`) with a signed cookie. Every table carries `user_id`, so multi-user is additive |

Key directories:

```
src/lib/ai/        prompts, schemas, and the pipelines (posting, fit, tailor, profile import, memory, coach, chat)
src/lib/ingest/    URL fetching (Greenhouse, Lever, Ashby fast paths, JSON-LD, Readability) and PDF/DOCX text extraction
src/lib/render/    DOCX and PDF rendering for resumes and cover letters
src/lib/services.ts  capture, generation, uploads, and profile import shared by the API and chat tools
src/lib/rules.ts   home-screen rules (follow-up due, deadline, interview, stale, missing materials)
src/app/api/       route handlers; src/lib/actions.ts holds the server actions
drizzle/           SQL migrations (regenerate with `npm run db:generate` after editing src/lib/db/schema.ts)
```

## Configuration

See `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables real model calls. Leave unset for mock mode, or force with `AI_MOCK=1`/`0` |
| `AI_MODEL_MAIN`, `AI_MODEL_FAST` | Model ids for the main and bulk-extraction tiers |
| `MONTHLY_BUDGET_USD` | Soft warning at 80 percent, hard stop at 100 percent of the month's estimated spend (Settings shows usage) |
| `APP_PASSWORD`, `AUTH_SECRET` | Sign-in gate. Required in production; optional in development |
| `DATABASE_URL` | Postgres connection string. Unset means embedded PGlite under `DATA_DIR` |
| `STORAGE_DRIVER` + `SUPABASE_*` | File storage backend |

## Deploying (Vercel + Supabase)

1. Create a Supabase project. Copy the **transaction pooler** connection string into `DATABASE_URL` (the driver is configured with `prepare: false` for it).
2. Create a private Storage bucket (default name `documents`). Set `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. Local disk is not persistent on Vercel.
3. Set `APP_PASSWORD` and a random `AUTH_SECRET`, plus `ANTHROPIC_API_KEY` and a `MONTHLY_BUDGET_USD`.
4. Deploy. Migrations apply on the first request; you can also run `npm run db:migrate` locally against the same `DATABASE_URL`.

Chat responses stream and generation calls can take a minute, so keep the function duration limit generous (the chat route asks for 300 seconds).

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # production server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:generate  # create a migration from schema changes
npm run db:migrate   # apply migrations to DATABASE_URL (or the embedded database)
```

## Limitations in this version

- Fetching a posting by URL is best effort. Greenhouse, Lever, and Ashby links and pages with schema.org JobPosting markup are reliable; LinkedIn, Indeed, and Workday usually need the text pasted or a printed PDF.
- No job discovery yet (planned for v2, see the plan). No auto-apply, by design.
- Single user. The schema is multi-tenant-ready but there is no sign-up flow.
- Generated documents use a clean built-in template rather than your original resume's formatting.
