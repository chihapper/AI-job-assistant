import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { env } from "../env";
import { getDb, schema } from "../db";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type SystemBlock = Anthropic.Beta.BetaTextBlockParam;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

let client: Anthropic | undefined;

/** Credentials come from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile). */
export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export const MODEL_MAIN = env.modelMain;
export const MODEL_FAST = env.modelFast;

// USD per million tokens, list prices as of October 2026. Only used for the usage display.
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

function pricingFor(model: string) {
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : PRICING["claude-opus-5-5"];
}

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function estimateCostUsd(model: string, usage: UsageLike): number {
  const p = pricingFor(model);
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      cacheRead * p.cacheRead +
      cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

export async function logUsage(opts: {
  model: string;
  purpose: string;
  applicationId?: string | null;
  usage: UsageLike;
}): Promise<void> {
  const db = await getDb();
  await db.insert(schema.usageLog).values({
    userId: env.userId,
    model: opts.model,
    purpose: opts.purpose,
    applicationId: opts.applicationId ?? null,
    inputTokens: opts.usage.input_tokens,
    outputTokens: opts.usage.output_tokens,
    cacheReadTokens: opts.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: opts.usage.cache_creation_input_tokens ?? 0,
    costUsd: estimateCostUsd(opts.model, opts.usage),
  });
}

export async function monthToDateSpendUsd(): Promise<number> {
  const db = await getDb();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${schema.usageLog.costUsd}), 0)` })
    .from(schema.usageLog)
    .where(and(eq(schema.usageLog.userId, env.userId), gte(schema.usageLog.createdAt, start)));
  return Number(rows[0]?.total ?? 0);
}

export class BudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(
      `Monthly AI budget reached ($${spent.toFixed(2)} of $${budget.toFixed(2)}). Raise MONTHLY_BUDGET_USD to continue.`,
    );
    this.name = "BudgetExceededError";
  }
}

export class ModelRefusalError extends Error {
  constructor(
    public category: string | null,
    public explanation: string | null,
  ) {
    super(`The model declined this request${category ? ` (${category})` : ""}.`);
    this.name = "ModelRefusalError";
  }
}

export async function assertBudget(): Promise<void> {
  if (env.monthlyBudgetUsd <= 0) return;
  const spent = await monthToDateSpendUsd();
  if (spent >= env.monthlyBudgetUsd) throw new BudgetExceededError(spent, env.monthlyBudgetUsd);
}

/** Haiku has no server-side refusal fallback; the Opus and Sonnet lines do. */
export function supportsFallbacks(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

export function cachedSystem(text: string): SystemBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function pdfBlock(base64: string): ContentBlockParam {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
  };
}

export interface StructuredCallOptions<T> {
  model: string;
  purpose: string;
  applicationId?: string | null;
  system: SystemBlock[];
  messages: MessageParam[];
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens?: number;
}

/**
 * One structured-output request. Thinking stays adaptive (the default on current models);
 * depth is controlled by `effort`. Refusals surface as ModelRefusalError after the
 * server-side fallback chain has been tried.
 */
export async function callStructured<T>(opts: StructuredCallOptions<T>): Promise<T> {
  await assertBudget();
  const api = getClient();
  const fallbackParams = supportsFallbacks(opts.model)
    ? { betas: ["server-side-fallback-2026-07-01" as const], fallbacks: "default" as const }
    : {};
  const response = await api.beta.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    ...fallbackParams,
  });
  await logUsage({
    model: response.model,
    purpose: opts.purpose,
    applicationId: opts.applicationId,
    usage: response.usage,
  });
  if (response.stop_reason === "refusal") {
    const details = response.stop_details;
    throw new ModelRefusalError(details?.category ?? null, details?.explanation ?? null);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The model's answer was cut off (max_tokens). Try again with a shorter input.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned no structured output.");
  }
  return response.parsed_output;
}
