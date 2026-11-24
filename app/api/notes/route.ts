import { NextResponse } from "next/server";
import { NO_STORE, apiGuard } from "@/lib/auth";
import { describeDbError, listNotes } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = await apiGuard();
  if (blocked) return blocked;

  try {
    const notes = await listNotes();
    return NextResponse.json({ notes }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/notes failed", error);
    return NextResponse.json(
      { error: "Could not load notes", detail: describeDbError(error) },
      { status: 500, headers: NO_STORE },
    );
  }
}
