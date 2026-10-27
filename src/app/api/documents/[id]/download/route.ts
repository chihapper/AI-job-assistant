import { errorResponse, requireApiAuth } from "@/lib/api";
import { getDocument } from "@/lib/queries";
import { documentBytes } from "@/lib/services";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { id } = await params;
    const doc = await getDocument(id);
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    const format = new URL(req.url).searchParams.get("format");
    const { buffer, mime, filename } = await documentBytes(doc, format === "pdf" ? "pdf" : format === "docx" ? "docx" : "original");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": mime,
        "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "content-length": String(buffer.length),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
