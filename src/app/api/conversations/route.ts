import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { createConversation, getApplication } from "@/lib/queries";

export async function POST(req: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { fields } = await readBody(req);
    let title = "New chat";
    if (fields.applicationId) {
      const app = await getApplication(fields.applicationId);
      if (!app) return Response.json({ error: "Application not found" }, { status: 404 });
      title = `${app.company}: ${app.title}`;
    }
    const convo = await createConversation({ applicationId: fields.applicationId || null, title });
    return Response.json({ id: convo.id });
  } catch (err) {
    return errorResponse(err);
  }
}
