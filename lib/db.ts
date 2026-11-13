// SERVER ONLY. Neon Postgres access. Never import this file from a client component.
// Env vars are read and the client is created lazily at request time, never at module load,
// so `next build` passes even before the database exists.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { type Note, isNoteColor, isNoteIcon } from "./notes";

type Sql = NeonQueryFunction<false, false>;

/** DATABASE_URL, else POSTGRES_URL, else the first env var whose name ends in _DATABASE_URL. */
export function getDatabaseUrl(): string | null {
  const env = process.env;
  const direct = env.DATABASE_URL?.trim();
  if (direct) return direct;
  const postgres = env.POSTGRES_URL?.trim();
  if (postgres) return postgres;
  const key = Object.keys(env)
    .sort()
    .find((name) => name.endsWith("_DATABASE_URL") && (env[name] ?? "").trim() !== "");
  return key ? (env[key] ?? "").trim() : null;
}

let client: { url: string; sql: Sql } | null = null;

function getSql(): Sql {
  const url = getDatabaseUrl();
  if (!url) throw new Error("No database URL is configured");
  if (!client || client.url !== url) client = { url, sql: neon(url) };
  return client.sql;
}

// Keep in sync with db/schema.sql.
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS notes (
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
)`;

const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC)`;

let schemaReady: Promise<void> | null = null;

/** Creates the table once per server instance (on the first API call). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql.query(CREATE_TABLE_SQL, []);
      await sql.query(CREATE_INDEX_SQL, []);
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
  const rows = await getSql().query(`SELECT ${NOTE_COLUMNS} FROM notes ORDER BY updated_at DESC`, []);
  return rows.map((row) => rowToNote(row));
}

/**
 * Upsert with last-write-wins: an existing row is only overwritten when the incoming
 * updatedAt is newer or equal. Returns whatever is stored afterwards.
 */
export async function upsertNote(note: Note): Promise<Note> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql.query(
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
  const current = await sql.query(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = $1`, [note.id]);
  return current.length > 0 ? rowToNote(current[0]) : note;
}

export async function deleteNote(id: string): Promise<void> {
  await ensureSchema();
  await getSql().query(`DELETE FROM notes WHERE id = $1`, [id]);
}
