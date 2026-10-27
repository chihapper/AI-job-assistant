import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE_NAME = "ja_session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const raw = env.authSecret ?? `derived-secret:${env.appPassword ?? "development"}`;
  return new TextEncoder().encode(createHash("sha256").update(raw).digest("hex"));
}

/** The sign-in gate is active whenever a password is configured, and always in production. */
export function authRequired(): boolean {
  return Boolean(env.appPassword) || env.isProduction;
}

export function passwordConfigured(): boolean {
  return Boolean(env.appPassword);
}

export function checkPassword(candidate: string): boolean {
  if (!env.appPassword) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.appPassword);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ u: env.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authRequired()) return true;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

/** For route handlers: returns a 401 response when the request is not signed in. */
export async function requireApiAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
