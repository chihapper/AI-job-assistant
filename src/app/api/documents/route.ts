import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/constants";
import { uploadDocument } from "@/lib/services";

export async function POST(req: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { fields, file } = await readBody(req);
    if (!file) return Response.json({ error: "No file uploaded." }, { status: 400 });
    const kind = (DOCUMENT_KINDS as readonly string[]).includes(fields.kind) ? (fields.kind as DocumentKind) : "other";
    const doc = await uploadDocument({
      applicationId: fields.applicationId || null,
      kind,
      buffer: file.buffer,
      filename: file.filename,
      mime: file.mime,
      title: fields.title || null,
    });
    return Response.json({ id: doc.id, title: doc.title });
  } catch (err) {
    return errorResponse(err);
  }
}
