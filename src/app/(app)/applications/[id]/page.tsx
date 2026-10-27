import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteApplicationButton, GenerateButtons, NewChatButton, StatusSelect } from "@/components/application-actions";
import { DocumentList, type DocumentItem } from "@/components/document-list";
import { DocumentUpload } from "@/components/document-upload";
import { FitPanel } from "@/components/fit-panel";
import { Badge, Button, Card, Input, Label, Notice, Select, Textarea } from "@/components/ui";
import { addContactAction, addEventAction, deleteContactAction, setNextActionAction, updateNotesAction } from "@/lib/actions";
import { EVENT_TYPES } from "@/lib/constants";
import { getApplicationBundle, getProfile } from "@/lib/queries";
import { formatDate, formatDateTime, money, toDateInputValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params;
  const { duplicate } = await searchParams;
  const [bundle, profile] = await Promise.all([getApplicationBundle(id), getProfile()]);
  if (!bundle) notFound();
  const { application: app, posting, events, documents, contacts, conversations } = bundle;
  const parsed = posting?.parsed;

  const docItems: DocumentItem[] = documents.map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    version: d.version,
    createdAt: d.createdAt.toISOString(),
    generated: Boolean(d.generatedData),
    sizeBytes: d.sizeBytes,
    notes: d.generatedData && "notes_for_user" in d.generatedData ? d.generatedData.notes_for_user : undefined,
  }));

  return (
    <div className="space-y-6">
      {duplicate ? <Notice tone="info">This posting was already tracked, so you were taken to the existing record.</Notice> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/applications" className="hover:underline">
              Applications
            </Link>{" "}
            /
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{app.company}</h1>
          <p className="text-lg text-zinc-700 dark:text-zinc-300">{app.title}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-500">
            {parsed?.location ? <span>{parsed.location}</span> : null}
            {parsed?.remote_policy && parsed.remote_policy !== "unknown" ? <Badge>{parsed.remote_policy}</Badge> : null}
            {parsed?.employment_type ? <Badge>{parsed.employment_type}</Badge> : null}
            {parsed && parsed.comp_source !== "none" ? (
              <Badge tone="green">
                {money(parsed.comp_min, parsed.comp_currency)}
                {parsed.comp_max ? ` – ${money(parsed.comp_max, parsed.comp_currency)}` : ""}
                {parsed.comp_source === "estimated" ? " (est.)" : ""}
              </Badge>
            ) : null}
            {parsed?.closes_at ? <Badge tone="amber">Closes {formatDate(parsed.closes_at)}</Badge> : null}
            {posting?.sourceUrl ? (
              <a href={posting.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline dark:text-indigo-300">
                Original posting ↗
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect applicationId={app.id} status={app.status} />
          <NewChatButton applicationId={app.id} />
          <DeleteApplicationButton applicationId={app.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Fit">
            {app.fit ? <FitPanel fit={app.fit} /> : <p className="text-sm text-zinc-500">{profile ? "No fit analysis yet. Use Recompute fit below." : "Import your profile to get a fit analysis."}</p>}
          </Card>

          {parsed ? (
            <Card title="Posting">
              <p className="text-sm leading-relaxed">{parsed.summary}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Must-haves</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {parsed.must_haves.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                    {parsed.must_haves.length === 0 ? <li className="list-none text-zinc-500">None listed</li> : null}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Nice-to-haves</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {parsed.nice_to_haves.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                    {parsed.nice_to_haves.length === 0 ? <li className="list-none text-zinc-500">None listed</li> : null}
                  </ul>
                </div>
              </div>
              {parsed.responsibilities.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">Responsibilities ({parsed.responsibilities.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {parsed.responsibilities.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </details>
              )}
              {parsed.confidence_notes.length > 0 && (
                <p className="mt-3 text-xs text-zinc-500">Parser notes: {parsed.confidence_notes.join(" · ")}</p>
              )}
              {posting?.rawText ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-500">Raw text</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded bg-zinc-50 p-3 text-xs whitespace-pre-wrap dark:bg-zinc-950">{posting.rawText}</pre>
                </details>
              ) : null}
            </Card>
          ) : null}

          <Card title="Timeline">
            <form action={addEventAction.bind(null, app.id)} className="mb-4 grid gap-2 rounded-lg border border-zinc-100 p-3 md:grid-cols-6 dark:border-zinc-800">
              <div className="md:col-span-1">
                <Label>Type</Label>
                <Select name="type" defaultValue="note">
                  {EVENT_TYPES.filter((t) => !["created", "status_change", "fit", "document"].includes(t)).map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Title</Label>
                <Input name="title" placeholder="Recruiter screen with Sam" required />
              </div>
              <div className="md:col-span-2">
                <Label>When</Label>
                <Input name="occurredAt" type="datetime-local" />
              </div>
              <div className="flex items-end md:col-span-1">
                <Button type="submit" variant="secondary" className="w-full">
                  Log
                </Button>
              </div>
              <div className="md:col-span-6">
                <Textarea name="body" rows={2} placeholder="Details (optional)" className="min-h-0" />
              </div>
            </form>
            <ol className="relative space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-zinc-300 dark:border-zinc-900 dark:bg-zinc-600" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-zinc-500">
                      {formatDateTime(e.occurredAt)} · {e.type.replace("_", " ")}
                    </span>
                  </div>
                  {e.body ? <p className="mt-0.5 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{e.body}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Next action">
            <form action={setNextActionAction.bind(null, app.id)} className="space-y-2">
              <Input name="nextAction" defaultValue={app.nextAction ?? ""} placeholder="Follow up with recruiter" />
              <div className="flex gap-2">
                <Input name="nextActionDue" type="date" defaultValue={toDateInputValue(app.nextActionDue)} />
                <Button type="submit" variant="secondary">
                  Save
                </Button>
              </div>
            </form>
            {app.appliedAt ? <p className="mt-3 text-xs text-zinc-500">Applied {formatDate(app.appliedAt)}</p> : null}
          </Card>

          <Card title="Materials">
            <GenerateButtons applicationId={app.id} hasProfile={Boolean(profile)} hasPosting={Boolean(posting)} />
            <div className="mt-4">
              <DocumentList documents={docItems} compact />
            </div>
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <DocumentUpload applicationId={app.id} />
            </div>
          </Card>

          <Card title="Notes">
            <form action={updateNotesAction.bind(null, app.id)} className="space-y-2">
              <Textarea name="notes" defaultValue={app.notes ?? ""} rows={5} placeholder="Anything worth remembering about this one." />
              <Button type="submit" variant="secondary" size="sm">
                Save notes
              </Button>
            </form>
          </Card>

          <Card title="Contacts">
            {contacts.length > 0 ? (
              <ul className="mb-3 space-y-2 text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.role ? <span className="text-zinc-500"> · {c.role}</span> : null}
                      <div className="text-xs text-zinc-500">
                        {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : null}
                        {c.linkedinUrl ? (
                          <>
                            {c.email ? " · " : ""}
                            <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="hover:underline">
                              LinkedIn
                            </a>
                          </>
                        ) : null}
                      </div>
                      {c.notes ? <p className="text-xs text-zinc-500">{c.notes}</p> : null}
                    </div>
                    <form action={deleteContactAction.bind(null, c.id, app.id)}>
                      <button type="submit" className="text-xs text-zinc-400 hover:text-red-600">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <details>
              <summary className="cursor-pointer text-sm text-indigo-700 dark:text-indigo-300">Add contact</summary>
              <form action={addContactAction.bind(null, app.id)} className="mt-2 grid gap-2">
                <Input name="name" placeholder="Name" required />
                <Input name="role" placeholder="Role (recruiter, hiring manager…)" />
                <Input name="email" type="email" placeholder="Email" />
                <Input name="linkedinUrl" placeholder="LinkedIn URL" />
                <Button type="submit" variant="secondary" size="sm">
                  Add
                </Button>
              </form>
            </details>
          </Card>

          {conversations.length > 0 && (
            <Card title="Chats about this">
              <ul className="space-y-1 text-sm">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/chat/${c.id}`} className="text-indigo-700 hover:underline dark:text-indigo-300">
                      {c.title}
                    </Link>
                    <span className="text-xs text-zinc-500"> · {formatDate(c.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
