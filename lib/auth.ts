// SERVER ONLY. Passcode check and signed session cookie (HMAC-SHA256 via node:crypto).
// Never import this file from a client component. Env vars are read inside functions only.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDatabaseUrl } from "./db";

export const SESSION_COOKIE = "msn_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year
const TOKEN_VERSION = "v1";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export type SetupItem = "APP_PASSCODE" | "SESSION_SECRET" | "DATABASE_URL";

/** Settings that still have to be added in Vercel before the app can work. */
export function getMissingConfig(): SetupItem[] {
  const missing: SetupItem[] = [];
  if (!process.env.APP_PASSCODE?.trim()) missing.push("APP_PASSCODE");
  if (!process.env.SESSION_SECRET?.trim()) missing.push("SESSION_SECRET");
  if (!getDatabaseUrl()) missing.push("DATABASE_URL");
  return missing;
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash both sides first so the comparison is constant-time and length-independent.
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** Token format: v1.<issued at, base36>.<random nonce>.<HMAC of the first three parts>. */
export function createSessionToken(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${TOKEN_VERSION}.${Date.now().toString(36)}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token || token.length > 256) return false;
  const secret = getSecret();
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;
  const payload = parts.slice(0, 3).join(".");
  if (!safeEqual(sign(payload, secret), parts[3])) return false;
  const issuedAt = parseInt(parts[1], 36);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  return age > -5 * 60 * 1000 && age < SESSION_MAX_AGE_SECONDS * 1000;
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function passcodeMatches(input: string): boolean {
  const expected = process.env.APP_PASSCODE?.trim();
  if (!expected) return false;
  return safeEqual(input.trim(), expected);
}

/**
 * A keyed hash of the caller's address, for counting passcode attempts without storing the address.
 * Vercel sets x-forwarded-for itself, so the caller cannot fake it there.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return sign(`ip:${ip}`, getSecret() ?? "");
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/**
 * Shared guard for API route handlers. Returns a response to send right away
 * (503 when setup is incomplete, 401 without a valid session) or null when the request may continue.
 */
export async function apiGuard(): Promise<NextResponse | null> {
  const missing = getMissingConfig();
  if (missing.length > 0) {
    return NextResponse.json({ error: "Setup needed", missing }, { status: 503, headers: NO_STORE });
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  return null;
}
