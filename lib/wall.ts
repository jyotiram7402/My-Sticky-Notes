// CLIENT ONLY. The "wall" view: where each note hangs, which notes are stuck down, and the bin.
// All of this is kept on the device (localStorage) and is not synced: every screen has its own wall.

import { type Note, normalizeNote } from "./notes";

export interface WallSpot {
  /** Horizontal position as a fraction (0 to 1) of the free width, so it survives a window resize. */
  x: number;
  /** Distance from the top of the wall in pixels. */
  y: number;
  /** Stuck to the wall (double-click) or loose. */
  stuck: boolean;
  /** Stacking order: the note moved last is on top. */
  z: number;
}

export type WallView = "wall" | "grid";

const WALL_KEY = "msn:wall:v1";
const TRASH_KEY = "msn:trash:v1";
const VIEW_KEY = "msn:view:v1";

/** How many crumpled notes the bin remembers. */
export const TRASH_LIMIT = 30;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked; the wall still works until the page is closed.
  }
}

export function loadWall(): Record<string, WallSpot> {
  const result: Record<string, WallSpot> = {};
  const stored = read(WALL_KEY);
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return result;
  for (const [id, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const spot = raw as Record<string, unknown>;
    const x = typeof spot.x === "number" && Number.isFinite(spot.x) ? spot.x : null;
    const y = typeof spot.y === "number" && Number.isFinite(spot.y) ? spot.y : null;
    if (x === null || y === null) continue;
    result[id] = {
      x: Math.min(1, Math.max(0, x)),
      y: Math.max(0, y),
      stuck: spot.stuck === true,
      z: typeof spot.z === "number" && Number.isFinite(spot.z) ? spot.z : 0,
    };
  }
  return result;
}

export function saveWall(spots: Record<string, WallSpot>): void {
  write(WALL_KEY, spots);
}

export function loadTrash(): Note[] {
  const stored = read(TRASH_KEY);
  if (!Array.isArray(stored)) return [];
  const notes: Note[] = [];
  for (const raw of stored) {
    const note = normalizeNote(raw);
    if (note) notes.push(note);
  }
  return notes.slice(0, TRASH_LIMIT);
}

export function saveTrash(notes: Note[]): void {
  write(TRASH_KEY, notes.slice(0, TRASH_LIMIT));
}

export function loadView(): WallView {
  return read(VIEW_KEY) === "grid" ? "grid" : "wall";
}

export function saveView(view: WallView): void {
  write(VIEW_KEY, view);
}

/** Removes the wall layout and the bin (used on log out). */
export function clearWallData(): void {
  try {
    window.localStorage.removeItem(WALL_KEY);
    window.localStorage.removeItem(TRASH_KEY);
  } catch {
    // ignore
  }
}
