import { env } from "../env";
import { MODEL_MAIN, cachedSystem, callStructured } from "./client";
import { mockAnalyzeFit } from "./mock";
import { FIT_SYSTEM, renderMemories, renderPosting, renderProfile } from "./prompts";
import { FitAnalysisSchema, fitScore, type FitAnalysis, type JobPosting, type Profile } from "./schemas";

export async function analyzeFit(opts: {
  profile: Profile;
  posting: JobPosting;
  memories?: string[];
  applicationId?: string | null;
}): Promise<FitAnalysis> {
  if (env.aiMock) return mockAnalyzeFit(opts.profile, opts.posting);

  const result = await callStructured({
    model: MODEL_MAIN,
    purpose: "fit_analysis",
    applicationId: opts.applicationId,
    system: [cachedSystem(`${FIT_SYSTEM}\n\n${renderProfile(opts.profile)}`)],
    messages: [
      {
        role: "user",
        content: [renderPosting(opts.posting), renderMemories(opts.memories ?? [])].filter(Boolean).join("\n\n"),
      },
    ],
    schema: FitAnalysisSchema,
    effort: "medium",
  });
  return { ...result, score: fitScore(result), computedAt: new Date().toISOString() };
}
