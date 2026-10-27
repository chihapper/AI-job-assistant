import fs from "node:fs";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { env } from "../env";

export type Db = PgliteDatabase<typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

const globalRef = globalThis as unknown as { __jobAssistantDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  if (env.databaseUrl) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    // prepare: false keeps compatibility with Supabase's transaction pooler.
    const client = postgres(env.databaseUrl, { max: 5, prepare: false });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(env.dataDir, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

/** Lazily opens the database and applies pending migrations once per process. */
export function getDb(): Promise<Db> {
  if (!globalRef.__jobAssistantDb) {
    globalRef.__jobAssistantDb = createDb().catch((err) => {
      globalRef.__jobAssistantDb = undefined;
      throw err;
    });
  }
  return globalRef.__jobAssistantDb;
}

export { schema };
