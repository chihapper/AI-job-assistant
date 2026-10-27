import { createHash } from "node:crypto";
import { env } from "../env";
import { MODEL_FAST, callStructured, pdfBlock, type ContentBlockParam } from "./client";
import { mockParsePosting } from "./mock";
import { POSTING_PARSE_SYSTEM } from "./prompts";
import { JobPostingSchema, type JobPosting } from "./schemas";

export interface PostingInput {
  text?: string;
  pdfBase64?: string;
  sourceUrl?: string | null;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");
}

export async function parsePosting(input: PostingInput): Promise<JobPosting> {
  if (!input.text && !input.pdfBase64) throw new Error("No posting content provided");
  if (env.aiMock) return mockParsePosting(input.text ?? "(PDF content not readable in mock mode)", input.sourceUrl);

  const content: ContentBlockParam[] = [];
  if (input.pdfBase64) content.push(pdfBlock(input.pdfBase64));
  content.push({
    type: "text",
    text:
      (input.sourceUrl ? `Source URL: ${input.sourceUrl}\n\n` : "") +
      (input.text ? `Job posting text:\n\n${input.text.slice(0, 60_000)}` : "Extract the job posting from the attached PDF."),
  });

  return callStructured({
    model: MODEL_FAST,
    purpose: "parse_posting",
    system: [{ type: "text", text: POSTING_PARSE_SYSTEM }],
    messages: [{ role: "user", content }],
    schema: JobPostingSchema,
    effort: "low",
    maxTokens: 8000,
  });
}
