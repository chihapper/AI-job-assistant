import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env";

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function safeName(filename: string): string {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return base || "file";
}

export function newStorageKey(filename: string): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}-${safeName(filename)}`;
}

class LocalStorageAdapter implements StorageAdapter {
  private root = path.join(env.dataDir, "files");

  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    const rel = path.relative(this.root, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class SupabaseStorageAdapter implements StorageAdapter {
  private clientPromise: Promise<{
    storage: {
      from(bucket: string): {
        upload(
          key: string,
          data: Buffer,
          opts: { contentType: string; upsert: boolean },
        ): Promise<{ error: { message: string } | null }>;
        download(key: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
        remove(keys: string[]): Promise<{ error: { message: string } | null }>;
      };
    };
  }>;

  constructor() {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error("STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    const url = env.supabaseUrl;
    const key = env.supabaseServiceRoleKey;
    this.clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key, { auth: { persistSession: false } }),
    );
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const client = await this.clientPromise;
    const { error } = await client.storage
      .from(env.supabaseBucket)
      .upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  }

  async get(key: string): Promise<Buffer> {
    const client = await this.clientPromise;
    const { data, error } = await client.storage.from(env.supabaseBucket).download(key);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const client = await this.clientPromise;
    const { error } = await client.storage.from(env.supabaseBucket).remove([key]);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  }
}

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (!adapter) {
    adapter = env.storageDriver === "supabase" ? new SupabaseStorageAdapter() : new LocalStorageAdapter();
  }
  return adapter;
}
