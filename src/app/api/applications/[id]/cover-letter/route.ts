import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { generateCoverLetterForApplication } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { id } = await params;
    const { fields } = await readBody(req);
    const { document, letter } = await generateCoverLetterForApplication(id, fields.instructions || null);
    return Response.json({ documentId: document.id, title: document.title, paragraphs: letter.paragraphs });
  } catch (err) {
    return errorResponse(err);
  }
}
