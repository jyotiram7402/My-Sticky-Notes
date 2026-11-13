import { NextResponse } from "next/server";
import { NO_STORE, SESSION_COOKIE, isAuthenticated, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const authenticated = await isAuthenticated();
  const response = authenticated
    ? NextResponse.json({ ok: true }, { headers: NO_STORE })
    : NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  // Clear the cookie either way.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
