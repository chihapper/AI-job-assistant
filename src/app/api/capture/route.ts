import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { captureApplication } from "@/lib/services";

export async function POST(req: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { fields, file } = await readBody(req);
    if (file && file.mime !== "application/pdf" && !file.filename.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Only PDF uploads are supported for postings. Paste the text for other formats." }, { status: 400 });
    }
    const result = await captureApplication({
      url: fields.url || null,
      text: fields.text || null,
      pdf: file ? { buffer: file.buffer, filename: file.filename } : null,
    });
    return Response.json({
      applicationId: result.application.id,
      duplicate: result.duplicate,
      company: result.application.company,
      title: result.application.title,
      via: result.via ?? null,
      fit: result.fit ? { overall: result.fit.overall, score: result.fit.score ?? null } : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
