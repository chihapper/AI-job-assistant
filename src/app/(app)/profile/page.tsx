import { ProfileEditor } from "@/components/profile-editor";
import { ProfileImport } from "@/components/profile-import";
import { Card, PageHeader } from "@/components/ui";
import { emptyProfile } from "@/lib/ai/schemas";
import { getProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getProfile();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Master profile"
        subtitle="The single source of truth for every tailored resume and cover letter. Nothing gets generated that is not in here."
      />
      <Card title="Import from a resume">
        <ProfileImport hasProfile={Boolean(profile)} />
      </Card>
      <Card title="Edit">
        <ProfileEditor key={profile ? JSON.stringify(profile).length : "empty"} initial={profile ?? emptyProfile()} />
      </Card>
    </div>
  );
}
