import { requireApiAuth } from "./auth";
import { BudgetExceededError, ModelRefusalError } from "./ai/client";
import { FetchPostingError } from "./ingest/fetch-url";

export { requireApiAuth };

export function errorResponse(err: unknown): Response {
  console.error(err);
  if (err instanceof FetchPostingError) return Response.json({ error: err.message, hint: err.hint }, { status: 422 });
  if (err instanceof ModelRefusalError) return Response.json({ error: err.message, hint: err.explanation ?? undefined }, { status: 422 });
  if (err instanceof BudgetExceededError) return Response.json({ error: err.message }, { status: 402 });
  if (err instanceof Error) return Response.json({ error: err.message }, { status: 400 });
  return Response.json({ error: "Unexpected error" }, { status: 500 });
}

export interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

/** Reads either a JSON body or a multipart form with an optional `file` field. */
export async function readBody(req: Request): Promise<{ fields: Record<string, string>; file: UploadedFile | null }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const fields: Record<string, string> = {};
    let file: UploadedFile | null = null;
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = value;
      } else if (value.size > 0) {
        if (value.size > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB.");
        file = { buffer: Buffer.from(await value.arrayBuffer()), filename: value.name || "upload", mime: value.type };
      }
    }
    return { fields, file };
  }
  const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) if (v !== null && v !== undefined) fields[k] = String(v);
  return { fields, file: null };
}
