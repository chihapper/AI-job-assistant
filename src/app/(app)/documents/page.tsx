import Link from "next/link";
import { DocumentList, type DocumentItem } from "@/components/document-list";
import { DocumentUpload } from "@/components/document-upload";
import { Card, PageHeader } from "@/components/ui";
import { listApplications, listDocuments } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [documents, applications] = await Promise.all([listDocuments(), listApplications()]);
  const appsById = new Map(applications.map((a) => [a.id, a]));
  const toItem = (d: (typeof documents)[number]): DocumentItem => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    version: d.version,
    createdAt: d.createdAt.toISOString(),
    generated: Boolean(d.generatedData),
    sizeBytes: d.sizeBytes,
  });
  const globalDocs = documents.filter((d) => !d.applicationId).map(toItem);
  const byApp = new Map<string, DocumentItem[]>();
  for (const d of documents) {
    if (!d.applicationId) continue;
    byApp.set(d.applicationId, [...(byApp.get(d.applicationId) ?? []), toItem(d)]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" subtitle="Your master resume, references, and portfolio live in the global library. Generated materials attach to their application." />
      <Card title="Global library">
        <DocumentList documents={globalDocs} />
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <DocumentUpload />
        </div>
      </Card>
      {[...byApp.entries()].map(([appId, docs]) => {
        const app = appsById.get(appId);
        return (
          <Card
            key={appId}
            title={
              <Link href={`/applications/${appId}`} className="hover:underline">
                {app ? `${app.company} — ${app.title}` : "Application"}
              </Link>
            }
          >
            <DocumentList documents={docs} />
          </Card>
        );
      })}
    </div>
  );
}
