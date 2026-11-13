// Shared note model: types, colors, icons, validation and sorting.
// Pure code with no browser or server dependencies, so both client and server import it.

export const NOTE_COLORS = ["yellow", "orange", "red", "green", "blue", "purple", "charcoal", "white"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_COLOR_HEX: Record<NoteColor, string> = {
  yellow: "#FFD43B",
  orange: "#FF9A3C",
  red: "#EF4B4B",
  green: "#2ECC71",
  blue: "#2D9CDB",
  purple: "#8B5CF6",
  charcoal: "#2B2B2E",
  white: "#FFFFFF",
};

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  charcoal: "Charcoal",
  white: "White",
};

export const NOTE_ICONS = ["link", "idea", "task", "meeting", "call", "coffee", "shopping", "travel"] as const;
export type NoteIcon = (typeof NOTE_ICONS)[number];

export const NOTE_ICON_LABEL: Record<NoteIcon, string> = {
  link: "Link",
  idea: "Idea",
  task: "Task",
  meeting: "Meeting",
  call: "Call",
  coffee: "Coffee",
  shopping: "Shopping",
  travel: "Travel",
};

export type TextColor = "dark" | "light";

export const TEXT_COLOR_HEX: Record<TextColor, string> = {
  dark: "#111111",
  light: "#FFFFFF",
};

/** Colors used for a note once it is marked done (grey, like a finished sticky). */
export const DONE_COLORS = { background: "#DCDCD8", text: "#5E5E5B" } as const;

export interface Note {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  textColor: TextColor;
  folder: string | null;
  icon: NoteIcon | null;
  dueAt: string | null;
  pinned: boolean;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export const LIMITS = {
  title: 200,
  content: 20_000,
  folder: 40,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === "string" && (NOTE_COLORS as readonly string[]).includes(value);
}

export function isNoteIcon(value: unknown): value is NoteIcon {
  return typeof value === "string" && (NOTE_ICONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Contrast: pick #111111 or #FFFFFF, whichever has the higher WCAG contrast.

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function defaultTextColor(color: NoteColor): TextColor {
  const background = NOTE_COLOR_HEX[color];
  const dark = contrastRatio(background, TEXT_COLOR_HEX.dark);
  const light = contrastRatio(background, TEXT_COLOR_HEX.light);
  return dark >= light ? "dark" : "light";
}

// ---------------------------------------------------------------------------
// Creating notes

/** crypto.randomUUID with a fallback for non-secure contexts (e.g. a LAN IP during development). */
export function newId(): string {
  const c: Crypto | undefined = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface NewNoteInput {
  title?: string;
  content?: string;
  color?: NoteColor;
  folder?: string | null;
  icon?: NoteIcon | null;
  dueAt?: string | null;
  pinned?: boolean;
}

export function createNote(input: NewNoteInput = {}): Note {
  const now = new Date().toISOString();
  const color = input.color ?? "yellow";
  return {
    id: newId(),
    title: input.title ?? "",
    content: input.content ?? "",
    color,
    textColor: defaultTextColor(color),
    folder: input.folder ?? null,
    icon: input.icon ?? null,
    dueAt: input.dueAt ?? null,
    pinned: input.pinned ?? false,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function isEmptyNote(note: Pick<Note, "title" | "content" | "dueAt">): boolean {
  return note.title.trim() === "" && note.content.trim() === "" && !note.dueAt;
}

// ---------------------------------------------------------------------------
// Validation (used by the API and when reading the local cache)

export type ParseResult = { ok: true; note: Note } | { ok: false; error: string };

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/** Returns a normalized ISO string, or null when the value is not a valid ISO timestamp. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !ISO_RE.test(value)) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

export function parseNote(id: string, input: unknown): ParseResult {
  if (!isUuid(id)) return fail("Invalid note id");
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Expected a note object");
  const raw = input as Record<string, unknown>;

  const rawId = raw.id;
  if (rawId !== undefined && (typeof rawId !== "string" || rawId.toLowerCase() !== id.toLowerCase())) {
    return fail("Note id does not match");
  }

  const title = raw.title ?? "";
  if (typeof title !== "string") return fail("Title must be text");
  if (title.length > LIMITS.title) return fail(`Title is longer than ${LIMITS.title} characters`);

  const content = raw.content ?? "";
  if (typeof content !== "string") return fail("Content must be text");
  if (content.length > LIMITS.content) return fail(`Content is longer than ${LIMITS.content} characters`);

  const color = raw.color ?? "yellow";
  if (!isNoteColor(color)) return fail("Unknown color");

  const rawTextColor = raw.textColor;
  let textColor: TextColor = defaultTextColor(color);
  if (rawTextColor === "light") textColor = "light";
  else if (rawTextColor === "dark") textColor = "dark";
  else if (rawTextColor !== undefined && rawTextColor !== null) return fail("Unknown text color");

  let folder: string | null = null;
  const rawFolder = raw.folder;
  if (rawFolder !== undefined && rawFolder !== null) {
    if (typeof rawFolder !== "string") return fail("Folder must be text");
    const trimmed = rawFolder.trim();
    if (trimmed.length > LIMITS.folder) return fail(`Folder name is longer than ${LIMITS.folder} characters`);
    folder = trimmed === "" ? null : trimmed;
  }

  let icon: NoteIcon | null = null;
  const rawIcon = raw.icon;
  if (rawIcon !== undefined && rawIcon !== null) {
    if (!isNoteIcon(rawIcon)) return fail("Unknown icon");
    icon = rawIcon;
  }

  let dueAt: string | null = null;
  const rawDue = raw.dueAt;
  if (rawDue !== undefined && rawDue !== null) {
    dueAt = parseIsoDate(rawDue);
    if (!dueAt) return fail("Invalid due date");
  }

  const pinned = raw.pinned ?? false;
  if (typeof pinned !== "boolean") return fail("Pinned must be true or false");

  const done = raw.done ?? false;
  if (typeof done !== "boolean") return fail("Done must be true or false");

  const updatedAt = parseIsoDate(raw.updatedAt);
  if (!updatedAt) return fail("Invalid updatedAt");

  const createdAt = raw.createdAt === undefined ? updatedAt : parseIsoDate(raw.createdAt);
  if (!createdAt) return fail("Invalid createdAt");

  return {
    ok: true,
    note: {
      id: id.toLowerCase(),
      title,
      content,
      color,
      textColor,
      folder,
      icon,
      dueAt,
      pinned,
      done,
      createdAt,
      updatedAt,
    },
  };
}

/** Tolerant reader for notes from localStorage or API responses. Returns null for anything invalid. */
export function normalizeNote(input: unknown): Note | null {
  if (typeof input !== "object" || input === null) return null;
  const id = (input as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const result = parseNote(id, input);
  return result.ok ? result.note : null;
}

// ---------------------------------------------------------------------------
// Sorting

export function timeOf(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

/** "Notes" order: open notes before done ones, pinned first, then most recently edited. */
export function compareNotes(a: Note, b: Note): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return timeOf(b.updatedAt) - timeOf(a.updatedAt);
}

/** A note belongs in "Coming up" when it is not done and its date is still ahead. */
export function isComingUp(note: Note, now: number): boolean {
  return !note.done && note.dueAt !== null && timeOf(note.dueAt) > now;
}

export function noteAsText(note: Pick<Note, "title" | "content">): string {
  return [note.title.trim(), note.content.trim()].filter((part) => part !== "").join("\n\n");
}
