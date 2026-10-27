import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { importProfileFromFile, importProfileFromText } from "@/lib/services";

export async function POST(req: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { fields, file } = await readBody(req);
    const profile = file
      ? await importProfileFromFile({ buffer: file.buffer, filename: file.filename, mime: file.mime })
      : fields.text?.trim()
        ? await importProfileFromText(fields.text)
        : null;
    if (!profile) return Response.json({ error: "Upload a resume file or paste its text." }, { status: 400 });
    return Response.json({ ok: true, name: profile.contact.name, roles: profile.work.length, skills: profile.skills.length });
  } catch (err) {
    return errorResponse(err);
  }
}
