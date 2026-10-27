import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { generateResumeForApplication } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { id } = await params;
    const { fields } = await readBody(req);
    const { document, tailored } = await generateResumeForApplication(id, fields.instructions || null);
    return Response.json({ documentId: document.id, title: document.title, notes: tailored.notes_for_user });
  } catch (err) {
    return errorResponse(err);
  }
}
