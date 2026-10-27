import path from "node:path";

function flag(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return undefined;
  return v === "1" || v.toLowerCase() === "true";
}

const hasApiCredentials = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
);

export const env = {
  /** Single-user v1: every row is still scoped by user id so multi-user is additive. */
  userId: process.env.APP_USER_ID ?? "local-user",
  dataDir: process.env.DATA_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR)
    : path.join(process.cwd(), "data"),
  databaseUrl: process.env.DATABASE_URL || undefined,
  appPassword: process.env.APP_PASSWORD || undefined,
  authSecret: process.env.AUTH_SECRET || undefined,
  aiMock: flag("AI_MOCK") ?? !hasApiCredentials,
  modelMain: process.env.AI_MODEL_MAIN || "claude-opus-5-5",
  modelFast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
  monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? "0") || 0,
  storageDriver: (process.env.STORAGE_DRIVER || "local") as "local" | "supabase",
  supabaseUrl: process.env.SUPABASE_URL || undefined,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET || "documents",
  isProduction: process.env.NODE_ENV === "production",
};

export type Env = typeof env;
