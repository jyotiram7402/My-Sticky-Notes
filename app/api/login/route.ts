import { NextResponse } from "next/server";
import {
  NO_STORE,
  SESSION_COOKIE,
  clientKey,
  createSessionToken,
  getMissingConfig,
  passcodeMatches,
  sessionCookieOptions,
} from "@/lib/auth";
import { clearLoginAttempts, recordLoginAttempt } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per 15 minutes. The total is a backstop against guessing from many addresses at once.
const MAX_ATTEMPTS_PER_ADDRESS = 10;
const MAX_ATTEMPTS_TOTAL = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const missing = getMissingConfig();
  if (missing.length > 0) {
    return NextResponse.json({ error: "Setup needed", missing }, { status: 503, headers: NO_STORE });
  }

  let passcode = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      const value = (body as { passcode?: unknown }).passcode;
      if (typeof value === "string") passcode = value;
    }
  } catch {
    passcode = "";
  }

  // Count the attempt before checking it, so a burst of guesses cannot slip past the limit.
  // If the database is unreachable the login still works; the one-second delay below remains.
  const key = clientKey(request);
  let limited = false;
  try {
    const attempts = await recordLoginAttempt(key);
    limited = attempts.fromIp > MAX_ATTEMPTS_PER_ADDRESS || attempts.total > MAX_ATTEMPTS_TOTAL;
  } catch (error) {
    console.error("Could not record the login attempt", error);
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "900" } },
    );
  }

  if (passcode === "" || passcode.length > 256 || !passcodeMatches(passcode)) {
    // Slow down guessing.
    await sleep(1000);
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401, headers: NO_STORE });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Setup needed" }, { status: 503, headers: NO_STORE });
  }

  try {
    await clearLoginAttempts(key);
  } catch (error) {
    console.error("Could not clear the login attempts", error);
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
