import { env } from "../env";
import { MODEL_MAIN, callStructured, pdfBlock, type ContentBlockParam } from "./client";
import { mockImportProfile } from "./mock";
import { PROFILE_IMPORT_SYSTEM } from "./prompts";
import { ProfileDraftSchema, assignProfileIds, type Profile } from "./schemas";

export async function importProfile(input: {
  text?: string;
  pdfBase64?: string;
  existing?: Profile;
}): Promise<Profile> {
  if (!input.text && !input.pdfBase64) throw new Error("No resume content provided");
  if (env.aiMock) return assignProfileIds(mockImportProfile(input.text ?? ""), input.existing);

  const content: ContentBlockParam[] = [];
  if (input.pdfBase64) content.push(pdfBlock(input.pdfBase64));
  content.push({
    type: "text",
    text: input.text ? `Resume text:\n\n${input.text.slice(0, 60_000)}` : "Extract the structured profile from the attached resume PDF.",
  });

  const draft = await callStructured({
    model: MODEL_MAIN,
    purpose: "profile_import",
    system: [{ type: "text", text: PROFILE_IMPORT_SYSTEM }],
    messages: [{ role: "user", content }],
    schema: ProfileDraftSchema,
    effort: "medium",
  });
  return assignProfileIds(draft, input.existing);
}
