// SERVER ONLY. Supabase Postgres access through postgres.js. Never import this file from a client component.
// Env vars are read and the client is created lazily at request time, never at module load,
// so `next build` passes even before the database exists.

import postgres from "postgres";
import { type Note, isNoteColor, isNoteIcon } from "./notes";

/**
 * DATABASE_URL, else POSTGRES_URL (added by Vercel's Supabase integration),
 * else the first env var whose name ends in _DATABASE_URL or _POSTGRES_URL.
 */
export function getDatabaseUrl(): string | null {
  const env = process.env;
  const direct = env.DATABASE_URL?.trim();
  if (direct) return direct;
  const postgresUrl = env.POSTGRES_URL?.trim();
  if (postgresUrl) return postgresUrl;
  const key = Object.keys(env)
    .sort()
    .find(
      (name) =>
        (name.endsWith("_DATABASE_URL") || name.endsWith("_POSTGRES_URL")) && (env[name] ?? "").trim() !== "",
    );
  return key ? (env[key] ?? "").trim() : null;
}

/**
 * Removes query parameters from the connection string and turns `sslmode` into the ssl option.
 * Vercel's Supabase variables add extras such as `supa=base-pooler.x`, which postgres.js would
 * otherwise send to the server as an unknown setting.
 */
function connectionFor(raw: string): { url: string; ssl: false | "require" } {
  try {
    const url = new URL(raw);
    const sslmode = url.searchParams.get("sslmode");
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    url.search = "";
    return { url: url.toString(), ssl: sslmode === "disable" || (isLocal && sslmode === null) ? false : "require" };
  } catch {
    return { url: raw, ssl: "require" };
  }
}

function createClient(raw: string) {
  const { url, ssl } = connectionFor(raw);
  return postgres(url, {
    ssl,
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    max_lifetime: 60 * 30,
    fetch_types: false,
    onnotice: false,
  });
}

type Sql = ReturnType<typeof createClient>;

let client: { raw: string; sql: Sql } | null = null;

function getSql(): Sql {
  const raw = getDatabaseUrl();
  if (!raw) throw new Error("No database URL is configured");
  if (!client || client.raw !== raw) client = { raw, sql: createClient(raw) };
  return client.sql;
}

/** The password inside the connection string, as written and decoded, so it can be hidden in messages. */
function passwordsOf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const encoded = new URL(raw).password;
    const found = [encoded];
    try {
      found.push(decodeURIComponent(encoded));
    } catch {
      // keep the encoded form only
    }
    return found.filter((value) => value.length >= 4);
  } catch {
    return [];
  }
}

/**
 * A short explanation of a database failure that is safe to show to the signed-in user:
 * a plain hint when the cause is recognised, then the driver's message with credentials removed.
 */
export function describeDbError(error: unknown): string {
  const record: Record<string, unknown> =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  let message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "";
  message = message.replace(/\/\/[^\s/@]*@/g, "//***@");
  for (const password of passwordsOf(getDatabaseUrl())) message = message.split(password).join("***");
  message = message.trim() || "Unknown error";

  const text = `${code} ${message}`.toLowerCase();
  let hint = "";
  if (/28p01|password authentication failed/.test(text)) {
    hint = "The database password in the connection string is wrong.";
  } else if (/tenant or user not found/.test(text)) {
    hint = "The user name or project in the connection string is wrong. Copy the Transaction pooler string again from Supabase → Connect.";
  } else if (/enotfound|eai_again|enetunreach|ehostunreach/.test(text)) {
    hint = "Vercel can't reach the database host. Use Supabase's Transaction pooler string (port 6543), not the Direct connection.";
  } else if (/connect_timeout|etimedout|econnrefused|econnreset/.test(text)) {
    hint = "The database did not answer. Check that the Supabase project is not paused and that the Transaction pooler string (port 6543) is used.";
  }

  const details = code ? `${message} (${code})` : message;
  return (hint ? `${hint} Details: ${details}` : details).slice(0, 400);
}

// Keep in sync with db/schema.sql.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS notes (
    id uuid PRIMARY KEY,
    title text NOT NULL DEFAULT '',
    content text NOT NULL DEFAULT '',
    color text NOT NULL DEFAULT 'yellow',
    text_color text NOT NULL DEFAULT 'dark',
    folder text,
    icon text,
    due_at timestamptz,
    pinned boolean NOT NULL DEFAULT false,
    done boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC)`,
  // Supabase publishes tables in "public" through its REST API. With row level security on and no
  // policies, its public API keys can't touch the notes; this server connects as the table owner.
  `ALTER TABLE notes ENABLE ROW LEVEL SECURITY`,
  // Passcode attempts, used to slow down guessing. The address is stored as a keyed hash, never as is.
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip_hash text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_attempted_at_idx ON login_attempts (attempted_at)`,
  `ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY`,
];

let schemaReady: Promise<void> | null = null;

/** Creates the table once per server instance (on the first API call). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.unsafe(statement);
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

// Timestamps come back as ISO strings with millisecond precision, the same format the client sends.
const ISO = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const NOTE_COLUMNS = [
  "id::text AS id",
  "title",
  "content",
  "color",
  "text_color",
  "folder",
  "icon",
  `${ISO("due_at")} AS due_at`,
  "pinned",
  "done",
  `${ISO("created_at")} AS created_at`,
  `${ISO("updated_at")} AS updated_at`,
].join(", ");

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function toBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function rowToNote(row: Record<string, unknown>): Note {
  const epoch = new Date(0).toISOString();
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    color: isNoteColor(row.color) ? row.color : "yellow",
    textColor: row.text_color === "light" ? "light" : "dark",
    folder: typeof row.folder === "string" && row.folder !== "" ? row.folder : null,
    icon: isNoteIcon(row.icon) ? row.icon : null,
    dueAt: toIso(row.due_at),
    pinned: toBool(row.pinned),
    done: toBool(row.done),
    createdAt: toIso(row.created_at) ?? epoch,
    updatedAt: toIso(row.updated_at) ?? epoch,
  };
}

export async function listNotes(): Promise<Note[]> {
  await ensureSchema();
  const rows = await getSql().unsafe(`SELECT ${NOTE_COLUMNS} FROM notes ORDER BY updated_at DESC`);
  return rows.map((row) => rowToNote(row));
}

/**
 * Upsert with last-write-wins: an existing row is only overwritten when the incoming
 * updatedAt is newer or equal. Returns whatever is stored afterwards.
 * Values are always passed as parameters ($1, $2, ...), never pasted into the SQL text.
 */
export async function upsertNote(note: Note): Promise<Note> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO notes (id, title, content, color, text_color, folder, icon, due_at, pinned, done, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       color = EXCLUDED.color,
       text_color = EXCLUDED.text_color,
       folder = EXCLUDED.folder,
       icon = EXCLUDED.icon,
       due_at = EXCLUDED.due_at,
       pinned = EXCLUDED.pinned,
       done = EXCLUDED.done,
       updated_at = EXCLUDED.updated_at
     WHERE notes.updated_at <= EXCLUDED.updated_at
     RETURNING ${NOTE_COLUMNS}`,
    [
      note.id,
      note.title,
      note.content,
      note.color,
      note.textColor,
      note.folder,
      note.icon,
      note.dueAt,
      note.pinned,
      note.done,
      note.createdAt,
      note.updatedAt,
    ],
  );
  if (rows.length > 0) return rowToNote(rows[0]);

  // The stored version is newer: return it so the client can catch up.
  const current = await sql.unsafe(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`, [note.id]);
  return current.length > 0 ? rowToNote(current[0]) : note;
}

/**
 * Records one passcode attempt and returns how many were made in the last 15 minutes,
 * from this address and in total (both counts include this attempt).
 */
export async function recordLoginAttempt(ipHash: string): Promise<{ fromIp: number; total: number }> {
  await ensureSchema();
  const sql = getSql();
  await sql.unsafe(`DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'`);
  await sql.unsafe(`INSERT INTO login_attempts (ip_hash) VALUES ($1)`, [ipHash]);
  const rows = await sql.unsafe(
    `SELECT (count(*) FILTER (WHERE ip_hash = $1))::int AS from_ip, count(*)::int AS total
     FROM login_attempts
     WHERE attempted_at > now() - interval '15 minutes'`,
    [ipHash],
  );
  const row: Record<string, unknown> = rows.length > 0 ? rows[0] : {};
  return { fromIp: Number(row.from_ip) || 0, total: Number(row.total) || 0 };
}

/** Forgets the attempts from one address after a successful login. */
export async function clearLoginAttempts(ipHash: string): Promise<void> {
  await ensureSchema();
  await getSql().unsafe(`DELETE FROM login_attempts WHERE ip_hash = $1`, [ipHash]);
}

/**
 * Deletes a note. When `before` (the time the note was deleted on the device) is given, the row is
 * only removed if it has not been edited since, so a delete queued offline never wipes a newer edit
 * from another device. Returns the note that was kept, or null when nothing is left.
 */
export async function deleteNote(id: string, before: string | null = null): Promise<Note | null> {
  await ensureSchema();
  const sql = getSql();
  if (before === null) {
    await sql.unsafe(`DELETE FROM notes WHERE id = $1`, [id]);
    return null;
  }
  const removed = await sql.unsafe(`DELETE FROM notes WHERE id = $1 AND updated_at <= $2 RETURNING id::text AS id`, [
    id,
    before,
  ]);
  if (removed.length > 0) return null;
  const current = await sql.unsafe(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`, [id]);
  return current.length > 0 ? rowToNote(current[0]) : null;
}
