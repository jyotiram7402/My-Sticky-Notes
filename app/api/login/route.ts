import { NextResponse } from "next/server";
import {
  NO_STORE,
  SESSION_COOKIE,
  createSessionToken,
  getMissingConfig,
  passcodeMatches,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (passcode === "" || passcode.length > 256 || !passcodeMatches(passcode)) {
    // Slow down guessing.
    await sleep(1000);
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401, headers: NO_STORE });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Setup needed" }, { status: 503, headers: NO_STORE });
  }

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
