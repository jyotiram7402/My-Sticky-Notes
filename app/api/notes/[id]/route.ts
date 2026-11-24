import { NextResponse } from "next/server";
import { NO_STORE, apiGuard } from "@/lib/auth";
import { deleteNote, describeDbError, upsertNote } from "@/lib/db";
import { isUuid, parseIsoDate, parseNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NoteRouteContext = { params: Promise<{ id: string }> };

const MAX_BODY_CHARS = 100_000;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/** Upsert with last-write-wins. Returns the stored note. */
export async function PUT(request: Request, context: NoteRouteContext) {
  const blocked = await apiGuard();
  if (blocked) return blocked;

  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Invalid note id");

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return badRequest("Note is too large", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("Body must be JSON");
  }

  const parsed = parseNote(id, body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const note = await upsertNote(parsed.note);
    return NextResponse.json({ note }, { headers: NO_STORE });
  } catch (error) {
    console.error("PUT /api/notes/[id] failed", error);
    return NextResponse.json(
      { error: "Could not save the note", detail: describeDbError(error) },
      { status: 500, headers: NO_STORE },
    );
  }
}

/**
 * Deletes a note. `?before=<ISO time of the delete>` makes it conditional: a note edited after that
 * time is kept and returned as `note`, so the device can show it again.
 */
export async function DELETE(request: Request, context: NoteRouteContext) {
  const blocked = await apiGuard();
  if (blocked) return blocked;

  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("Invalid note id");

  const before = parseIsoDate(new URL(request.url).searchParams.get("before"));

  try {
    const kept = await deleteNote(id.toLowerCase(), before);
    return NextResponse.json({ ok: true, note: kept }, { headers: NO_STORE });
  } catch (error) {
    console.error("DELETE /api/notes/[id] failed", error);
    return NextResponse.json(
      { error: "Could not delete the note", detail: describeDbError(error) },
      { status: 500, headers: NO_STORE },
    );
  }
}
