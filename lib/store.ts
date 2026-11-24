// CLIENT ONLY. Local-first note store.
// - Notes and a queue of pending changes live in localStorage, so the app opens instantly and works offline.
// - Edits update the UI at once, go into the queue (one entry per note) and are flushed in the background
//   with retry and backoff.
// - A full sync (flush, then fetch and reconcile) runs on open, on focus, when the tab becomes visible,
//   when the device comes back online, and every 60 s only while the window is focused.
// This module is evaluated during server rendering too, so nothing touches `window` at import time.

import { type Note, normalizeNote, timeOf } from "./notes";

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

export interface StoreSnapshot {
  notes: Note[];
  status: SyncStatus;
  ready: boolean;
}

// `rejected`: the server refused this note (too large or invalid). It stays on this device and is not
// sent again until the note is edited or a manual sync is asked for.
type UpsertOp = { kind: "upsert"; id: string; note: Note; isNew: boolean; queuedAt: number; rejected?: boolean };
type DeleteOp = { kind: "delete"; id: string; deletedAt: string; queuedAt: number };
type PendingOp = UpsertOp | DeleteOp;

type FlushResult = "ok" | "partial" | "offline" | "auth";
type FetchResult = Note[] | "auth" | "offline" | "error";

const NOTES_KEY = "msn:notes:v1";
const QUEUE_KEY = "msn:queue:v1";
const FLUSH_DELAY_MS = 400;
const POLL_INTERVAL_MS = 60_000;
const MIN_RESYNC_GAP_MS = 2_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
// Answers that mean "this request is wrong", as opposed to "try again later".
const PERMANENT_STATUSES = new Set([400, 413, 422]);

const SERVER_SNAPSHOT: StoreSnapshot = { notes: [], status: "syncing", ready: false };

let notes = new Map<string, Note>();
let queue = new Map<string, PendingOp>();
let list: Note[] = [];
let snapshot: StoreSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

let loaded = false;
let started = false;
let authLost = false;

let running = false;
let wantFlush = false;
let wantFetch = false;
let pumpPromise: Promise<void> = Promise.resolve();
let networkDown = false;
let hadError = false;
let lastFetchAt = 0;

let retryAttempt = 0;
let retryTimer: number | null = null;
let flushTimer: number | null = null;
let pollTimer: number | null = null;

// ---------------------------------------------------------------------------
// localStorage

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked; the app keeps working from memory.
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeOp(raw: unknown): PendingOp | null {
  if (typeof raw !== "object" || raw === null) return null;
  const op = raw as Record<string, unknown>;
  const queuedAt = typeof op.queuedAt === "number" && Number.isFinite(op.queuedAt) ? op.queuedAt : Date.now();
  if (op.kind === "upsert") {
    const note = normalizeNote(op.note);
    return note
      ? { kind: "upsert", id: note.id, note, isNew: op.isNew === true, queuedAt, rejected: op.rejected === true }
      : null;
  }
  if (op.kind === "delete" && typeof op.id === "string" && typeof op.deletedAt === "string") {
    return { kind: "delete", id: op.id, deletedAt: op.deletedAt, queuedAt };
  }
  return null;
}

function loadFromStorage(): void {
  const nextNotes = new Map<string, Note>();
  const storedNotes = readJson(NOTES_KEY);
  if (Array.isArray(storedNotes)) {
    for (const raw of storedNotes) {
      const note = normalizeNote(raw);
      if (note) nextNotes.set(note.id, note);
    }
  }
  const nextQueue = new Map<string, PendingOp>();
  const storedQueue = readJson(QUEUE_KEY);
  if (Array.isArray(storedQueue)) {
    for (const raw of storedQueue) {
      const op = normalizeOp(raw);
      if (op) nextQueue.set(op.id, op);
    }
  }
  notes = nextNotes;
  queue = nextQueue;
}

function persist(): void {
  writeJson(NOTES_KEY, Array.from(notes.values()));
  writeJson(QUEUE_KEY, Array.from(queue.values()));
}

// ---------------------------------------------------------------------------
// Snapshot for useSyncExternalStore

function sortedList(): Note[] {
  return Array.from(notes.values()).sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}

function isRejected(op: PendingOp): boolean {
  return op.kind === "upsert" && op.rejected === true;
}

function hasRejected(): boolean {
  for (const op of queue.values()) {
    if (isRejected(op)) return true;
  }
  return false;
}

function computeStatus(): SyncStatus {
  if (running) return "syncing";
  if (networkDown || (typeof navigator !== "undefined" && navigator.onLine === false)) return "offline";
  if (hadError || hasRejected()) return "error";
  if (queue.size > 0) return "syncing";
  return "synced";
}

function ensureLoaded(): void {
  if (loaded || !isBrowser()) return;
  loaded = true;
  loadFromStorage();
  list = sortedList();
  snapshot = { notes: list, status: computeStatus(), ready: true };
}

function emit(notesChanged = false): void {
  if (!loaded) return;
  if (notesChanged) list = sortedList();
  const status = computeStatus();
  if (!notesChanged && snapshot.ready && snapshot.status === status) return;
  snapshot = { notes: list, status, ready: true };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): StoreSnapshot {
  ensureLoaded();
  return snapshot;
}

export function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Local changes (instant), queued for the server

export function saveNote(note: Note, options: { isNew?: boolean } = {}): void {
  ensureLoaded();
  const previous = queue.get(note.id);
  const isNew = options.isNew === true || (previous?.kind === "upsert" && previous.isNew);
  notes.set(note.id, note);
  queue.set(note.id, { kind: "upsert", id: note.id, note, isNew, queuedAt: Date.now() });
  persist();
  emit(true);
  scheduleFlush();
}

export function removeNote(id: string): Note | null {
  ensureLoaded();
  const existing = notes.get(id) ?? null;
  notes.delete(id);
  queue.set(id, { kind: "delete", id, deletedAt: new Date().toISOString(), queuedAt: Date.now() });
  persist();
  emit(true);
  scheduleFlush();
  return existing;
}

/** Brings a deleted note back (Undo). It is treated as a new note so a sync never drops it. */
export function restoreNote(note: Note): void {
  saveNote(note, { isNew: true });
}

export function hasPendingChanges(): boolean {
  ensureLoaded();
  return queue.size > 0;
}

/** Removes the local cache and queue (used on log out). */
export function clearLocalData(): void {
  clearTimers();
  stopPolling();
  notes = new Map();
  queue = new Map();
  removeKey(NOTES_KEY);
  removeKey(QUEUE_KEY);
  emit(true);
}

// ---------------------------------------------------------------------------
// Network

function clearTimers(): void {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(): void {
  if (!started || authLost) return;
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void request(false);
  }, FLUSH_DELAY_MS);
}

function scheduleRetry(): void {
  if (authLost || retryTimer !== null || !isBrowser()) return;
  const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** retryAttempt) + Math.floor(Math.random() * 500);
  retryAttempt = Math.min(retryAttempt + 1, 10);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void request(true);
  }, delay);
}

function resetBackoff(): void {
  retryAttempt = 0;
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function onAuthLost(): void {
  if (authLost) return;
  authLost = true;
  clearTimers();
  stopPolling();
  persist();
  // Local data and the queue stay in localStorage, so nothing is lost; they sync after logging in.
  window.location.replace("/login");
}

/** Runs the sync loop. Flushes the queue, and also fetches from the server when `fetchAll` is set. */
function request(fetchAll: boolean): Promise<void> {
  if (!isBrowser() || authLost) return Promise.resolve();
  ensureLoaded();
  wantFlush = true;
  if (fetchAll) wantFetch = true;
  if (!running) pumpPromise = pump();
  return pumpPromise;
}

async function pump(): Promise<void> {
  running = true;
  emit();
  try {
    while ((wantFlush || wantFetch) && !authLost) {
      if (navigator.onLine === false) {
        networkDown = true;
        wantFlush = false;
        wantFetch = false;
        break;
      }
      const fetchAll = wantFetch;
      wantFlush = false;
      wantFetch = false;
      const ok = await runOnce(fetchAll);
      if (!ok) {
        scheduleRetry();
        break;
      }
    }
  } catch {
    hadError = true;
    scheduleRetry();
  } finally {
    running = false;
    emit();
  }
}

async function runOnce(fetchAll: boolean): Promise<boolean> {
  const flushed = await flushQueue();
  if (flushed === "auth") {
    onAuthLost();
    return false;
  }
  if (flushed === "offline") {
    networkDown = true;
    return false;
  }
  networkDown = false;

  if (fetchAll) {
    lastFetchAt = Date.now();
    const result = await fetchServerNotes();
    if (result === "auth") {
      onAuthLost();
      return false;
    }
    if (result === "offline") {
      networkDown = true;
      return false;
    }
    if (result === "error") {
      hadError = true;
      return false;
    }
    reconcile(result);
    persist();
    emit(true);
  }

  if (flushed === "partial") {
    hadError = true;
    return false;
  }
  hadError = false;
  resetBackoff();
  return true;
}

async function flushQueue(): Promise<FlushResult> {
  if (queue.size === 0) return "ok";
  const ops = Array.from(queue.values())
    .filter((op) => !isRejected(op))
    .sort((a, b) => a.queuedAt - b.queuedAt);
  let partial = false;

  for (const op of ops) {
    const url = `/api/notes/${encodeURIComponent(op.id)}`;
    let response: Response;
    try {
      response =
        op.kind === "upsert"
          ? await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(op.note),
              cache: "no-store",
              credentials: "same-origin",
            })
          : await fetch(`${url}?before=${encodeURIComponent(op.deletedAt)}`, {
              method: "DELETE",
              cache: "no-store",
              credentials: "same-origin",
            });
    } catch {
      return "offline";
    }
    if (response.status === 401) return "auth";
    if (!response.ok) {
      if (!PERMANENT_STATUSES.has(response.status)) {
        partial = true;
        continue;
      }
      // The server will never accept this request, so sending it again cannot help.
      const latest = queue.get(op.id);
      if (op.kind === "upsert") {
        if (latest && latest.kind === "upsert" && latest.note.updatedAt === op.note.updatedAt) {
          queue.set(op.id, { ...latest, rejected: true });
        }
      } else if (latest && latest.kind === "delete" && latest.deletedAt === op.deletedAt) {
        queue.delete(op.id);
      }
      persist();
      emit(true);
      continue;
    }

    const current = queue.get(op.id);
    if (op.kind === "upsert") {
      let stored: Note | null = null;
      try {
        const data: unknown = await response.json();
        stored = typeof data === "object" && data !== null ? normalizeNote((data as { note?: unknown }).note) : null;
      } catch {
        stored = null;
      }
      // Only clear the entry if nothing newer was queued while the request was in flight.
      if (current && current.kind === "upsert" && current.note.updatedAt === op.note.updatedAt) {
        queue.delete(op.id);
        if (stored && timeOf(stored.updatedAt) > timeOf(op.note.updatedAt)) {
          notes.set(stored.id, stored); // the server kept a newer version
        }
      }
    } else {
      let kept: Note | null = null;
      try {
        const data: unknown = await response.json();
        kept = typeof data === "object" && data !== null ? normalizeNote((data as { note?: unknown }).note) : null;
      } catch {
        kept = null;
      }
      if (current && current.kind === "delete" && current.deletedAt === op.deletedAt) {
        queue.delete(op.id);
        // The note was edited on another device after this delete: the server kept it, so show it again.
        if (kept && kept.id === op.id) notes.set(kept.id, kept);
      }
    }
    persist();
    emit(true);
  }
  return partial ? "partial" : "ok";
}

async function fetchServerNotes(): Promise<FetchResult> {
  let response: Response;
  try {
    response = await fetch("/api/notes", { cache: "no-store", credentials: "same-origin" });
  } catch {
    return "offline";
  }
  if (response.status === 401) return "auth";
  if (!response.ok) return "error";
  try {
    const data: unknown = await response.json();
    const rawNotes = typeof data === "object" && data !== null ? (data as { notes?: unknown }).notes : null;
    if (!Array.isArray(rawNotes)) return "error";
    const result: Note[] = [];
    for (const raw of rawNotes) {
      const note = normalizeNote(raw);
      if (note) result.push(note);
    }
    return result;
  } catch {
    return "error";
  }
}

/**
 * The server wins unless a pending local change is newer.
 * Notes missing on the server are removed unless they are pending local creates.
 */
function reconcile(serverNotes: Note[]): void {
  const next = new Map<string, Note>();
  const serverIds = new Set<string>();

  for (const serverNote of serverNotes) {
    serverIds.add(serverNote.id);
    const op = queue.get(serverNote.id);
    if (op?.kind === "upsert") {
      if (timeOf(op.note.updatedAt) > timeOf(serverNote.updatedAt)) {
        next.set(serverNote.id, op.note);
        continue;
      }
      queue.delete(serverNote.id);
    } else if (op?.kind === "delete") {
      if (timeOf(op.deletedAt) >= timeOf(serverNote.updatedAt)) continue;
      queue.delete(serverNote.id);
    }
    next.set(serverNote.id, serverNote);
  }

  for (const [id, op] of Array.from(queue.entries())) {
    if (serverIds.has(id)) continue;
    if (op.kind === "upsert" && op.isNew) {
      next.set(id, op.note);
    } else {
      queue.delete(id);
    }
  }

  notes = next;
}

// ---------------------------------------------------------------------------
// Triggers

function startPolling(): void {
  if (pollTimer !== null || !isBrowser()) return;
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible" && document.hasFocus()) void request(true);
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function resyncIfStale(): void {
  if (Date.now() - lastFetchAt < MIN_RESYNC_GAP_MS) return;
  void request(true);
}

function handleOnline(): void {
  networkDown = false;
  resetBackoff();
  emit();
  void request(true);
}

function handleOffline(): void {
  networkDown = true;
  emit();
}

function handleFocus(): void {
  startPolling();
  resyncIfStale();
}

function handleBlur(): void {
  stopPolling();
}

function handleVisibility(): void {
  if (document.visibilityState === "visible") {
    if (document.hasFocus()) startPolling();
    resyncIfStale();
  } else {
    stopPolling();
  }
}

function handleStorage(event: StorageEvent): void {
  // Another tab changed the cache: pick up its notes and queue.
  if (event.key !== null && event.key !== NOTES_KEY && event.key !== QUEUE_KEY) return;
  loadFromStorage();
  emit(true);
}

/** Starts background sync. Safe to call more than once. */
export function initStore(): void {
  if (started || !isBrowser()) return;
  ensureLoaded();
  started = true;
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("storage", handleStorage);
  document.addEventListener("visibilitychange", handleVisibility);
  if (document.visibilityState === "visible" && document.hasFocus()) startPolling();
  void request(true);
}

/** Manual sync from the status button. */
export function syncNow(): Promise<void> {
  ensureLoaded();
  // Give notes the server refused earlier one more try.
  for (const [id, op] of Array.from(queue.entries())) {
    if (op.kind === "upsert" && op.rejected) queue.set(id, { ...op, rejected: false });
  }
  hadError = false;
  networkDown = false;
  resetBackoff();
  return request(true);
}

/** Tries to push pending changes, waiting at most `timeoutMs`. */
export async function flushNow(timeoutMs = 4_000): Promise<void> {
  ensureLoaded();
  if (queue.size === 0 || !isBrowser()) return;
  await Promise.race([
    request(false),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}
