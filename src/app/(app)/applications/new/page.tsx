import { CaptureForm } from "@/components/capture-form";
import { Card, PageHeader } from "@/components/ui";

export default function NewApplicationPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Capture a posting" subtitle="A link, pasted text, or a PDF. The posting is parsed, a record is created, and fit analysis runs against your profile." />
      <Card>
        <CaptureForm />
      </Card>
    </div>
  );
}
