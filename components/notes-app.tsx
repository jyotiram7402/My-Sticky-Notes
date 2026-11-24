"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LayoutGrid, LogOut, Search, StickyNote, X } from "lucide-react";
import {
  compareNotes,
  createNote,
  isComingUp,
  isEmptyNote,
  newId,
  timeOf,
  type NewNoteInput,
  type Note,
} from "@/lib/notes";
import { buildSharedNote, linkDomain, noteLinks } from "@/lib/links";
import {
  clearLocalData,
  flushNow,
  getServerSnapshot,
  getSnapshot,
  hasPendingChanges,
  initStore,
  removeNote,
  restoreNote,
  saveNote,
  subscribe,
  syncNow,
} from "@/lib/store";
import {
  TRASH_LIMIT,
  clearWallData,
  loadTrash,
  loadView,
  saveTrash,
  saveView,
  type WallView,
} from "@/lib/wall";
import { ToastProvider, useToast } from "./toast";
import { Wall } from "./wall";
import { AddNoteCard, NoteCard, NoteSkeleton } from "./note-card";
import { NoteEditor } from "./note-editor";
import { Sheet } from "./sheet";
import { MenuButton } from "./menu";
import { InstallButton } from "./install-button";
import { SyncButton } from "./sync-button";

interface EditorState {
  note: Note;
  isNew: boolean;
  startDirty: boolean;
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

export function NotesApp() {
  return (
    <ToastProvider>
      <NotesHome />
    </ToastProvider>
  );
}

/** Current time, refreshed every minute while the page is visible. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function emptyMessage(filter: string, query: string, hasNotes: boolean): string {
  const trimmed = query.trim();
  if (trimmed) return `Nothing matches “${trimmed}”.`;
  if (!hasNotes) return "No notes yet. Tap + to add your first one.";
  if (filter === "links") return "No links saved yet.";
  if (filter === "pinned") return "No pinned notes.";
  if (filter === "done") return "Nothing is marked done yet.";
  if (filter.startsWith("folder:")) return "This folder is empty.";
  return "No notes yet.";
}

function NotesHome() {
  const { notes, status, ready, detail } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toast = useToast();
  const now = useNow();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Wall view: laptops only (wide screen with a mouse). The layout and the bin stay on this device.
  const [wide, setWide] = useState(false);
  const [view, setView] = useState<WallView>("wall");
  const [trash, setTrash] = useState<Note[]>([]);
  const trashRef = useRef<Note[]>([]);

  useEffect(() => {
    const stored = loadTrash();
    trashRef.current = stored;
    setTrash(stored);
    setView(loadView());
    const media = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const wallMode = ready && wide && view === "wall";

  // Cached notes render right away; this starts the background sync.
  useEffect(() => {
    initStore();
  }, []);

  const folders = useMemo(() => {
    const names = new Set<string>();
    for (const note of notes) {
      if (note.folder) names.add(note.folder);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [notes]);

  const activeFilter = filter.startsWith("folder:") && !folders.includes(filter.slice(7)) ? "all" : filter;
  const activeFolder = activeFilter.startsWith("folder:") ? activeFilter.slice(7) : null;

  const linksById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const note of notes) map.set(note.id, noteLinks(note));
    return map;
  }, [notes]);

  const { comingUp, others, visibleCount } = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter((term) => term !== "");
    const visible = notes.filter((note) => {
      const links = linksById.get(note.id) ?? [];
      if (activeFilter === "links" && links.length === 0) return false;
      if (activeFilter === "pinned" && !note.pinned) return false;
      if (activeFilter === "done" && !note.done) return false;
      if (activeFolder !== null && note.folder !== activeFolder) return false;
      if (terms.length === 0) return true;
      const haystack = [note.title, note.content, note.folder ?? "", ...links.map(linkDomain)].join("\n").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    const upcoming = visible
      .filter((note) => isComingUp(note, now))
      .sort((a, b) => timeOf(a.dueAt) - timeOf(b.dueAt));
    const upcomingIds = new Set(upcoming.map((note) => note.id));
    const rest = visible.filter((note) => !upcomingIds.has(note.id)).sort(compareNotes);
    return { comingUp: upcoming, others: rest, visibleCount: visible.length };
  }, [notes, linksById, activeFilter, activeFolder, query, now]);

  const openEditor = useCallback((state: EditorState) => {
    setEditor(state);
    setEditorOpen(true);
  }, []);

  const openNote = useCallback((note: Note) => openEditor({ note, isNew: false, startDirty: false }), [openEditor]);

  const openNew = useCallback(
    (input: NewNoteInput = {}, startDirty = false) => {
      openEditor({ note: createNote({ folder: activeFolder, ...input }), isNew: true, startDirty });
    },
    [openEditor, activeFolder],
  );

  const closeEditor = useCallback(() => setEditorOpen(false), []);
  const unmountEditor = useCallback(() => setEditor(null), []);

  const updateTrash = useCallback((next: Note[]) => {
    trashRef.current = next;
    saveTrash(next);
    setTrash(next);
  }, []);

  /** Takes a note back out of the bin. */
  const putBack = useCallback(
    (note: Note) => {
      restoreNote({ ...note, updatedAt: new Date().toISOString() });
      updateTrash(trashRef.current.filter((item) => item.id !== note.id));
    },
    [updateTrash],
  );

  /** Deletes a saved note and keeps a copy in this device's bin, so it can be put back later. */
  const moveToTrash = useCallback(
    (note: Note, message: string) => {
      removeNote(note.id);
      updateTrash([note, ...trashRef.current.filter((item) => item.id !== note.id)].slice(0, TRASH_LIMIT));
      toast.show({ message, actionLabel: "Undo", duration: 5000, onAction: () => putBack(note) });
    },
    [toast, updateTrash, putBack],
  );

  const crumpleNote = useCallback((note: Note) => moveToTrash(note, "Note crumpled"), [moveToTrash]);
  const emptyTrash = useCallback(() => updateTrash([]), [updateTrash]);

  const handleDelete = useCallback(
    (note: Note, persisted: boolean) => {
      setEditorOpen(false);
      if (persisted) {
        moveToTrash(note, "Note deleted");
        return;
      }
      if (isEmptyNote(note)) return;
      toast.show({
        message: "Note deleted",
        actionLabel: "Undo",
        duration: 5000,
        onAction: () => restoreNote(note),
      });
    },
    [toast, moveToTrash],
  );

  const switchView = useCallback((next: WallView) => {
    setView(next);
    saveView(next);
  }, []);

  const handleDuplicate = useCallback(
    (note: Note) => {
      const stamp = new Date().toISOString();
      const copy: Note = { ...note, id: newId(), pinned: false, done: false, createdAt: stamp, updatedAt: stamp };
      saveNote(copy, { isNew: true });
      setEditor({ note: copy, isNew: false, startDirty: false });
      toast.show({ message: "Note duplicated" });
    },
    [toast],
  );

  // Android share target: works online (/share page) and offline (cached app shell), then cleans the URL.
  const openNewRef = useRef(openNew);
  useEffect(() => {
    openNewRef.current = openNew;
  });
  useEffect(() => {
    if (window.location.pathname !== "/share") return;
    const params = new URLSearchParams(window.location.search);
    const shared = buildSharedNote({
      title: params.get("title"),
      text: params.get("text"),
      url: params.get("url"),
    });
    window.history.replaceState(null, "", "/");
    if (!shared) return;
    openNewRef.current(
      { title: shared.title, content: shared.content, icon: shared.links.length > 0 ? "link" : null },
      true,
    );
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Laptop shortcuts, only when not typing in a field: N = new note, / = search, Esc = close.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        openNew();
      } else if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      } else if (event.key === "Escape" && searchOpen) {
        closeSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNew, searchOpen, closeSearch]);

  const logout = useCallback(async () => {
    await flushNow();
    if (
      hasPendingChanges() &&
      !window.confirm("Some changes haven't synced yet. Log out anyway? They will be removed from this device.")
    ) {
      return;
    }
    try {
      await fetch("/api/logout", { method: "POST", cache: "no-store", credentials: "same-origin" });
    } catch {
      toast.show({ message: "You're offline. Connect to the internet to log out." });
      return;
    }
    clearLocalData();
    clearWallData();
    window.location.replace("/login");
  }, [toast]);

  const chips = [
    { key: "all", label: "All" },
    { key: "links", label: "Links" },
    { key: "pinned", label: "Pinned" },
    { key: "done", label: "Done" },
    ...folders.map((folder) => ({ key: `folder:${folder}`, label: folder })),
  ];

  const showComingUp = comingUp.length > 0;
  const wallNotes = useMemo(() => [...comingUp, ...others], [comingUp, others]);

  return (
    <>
      <div inert={editorOpen} className={wallMode ? "wall-room min-h-dvh" : "min-h-dvh"}>
        <header
          className={`safe-top sticky top-0 z-20 backdrop-blur-md ${wallMode ? "bg-[#ece5d6]/75" : "bg-app/90"}`}
        >
          <div className="safe-x mx-auto flex h-16 w-full max-w-[1200px] items-center gap-2">
            <SyncButton status={status} onSync={() => void syncNow()} />
            <InstallButton />
            <div className="ml-auto flex items-center gap-2">
              {wide ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={view === "wall" ? "Show notes as a grid" : "Show notes on the wall"}
                  title={view === "wall" ? "Grid view" : "Wall view"}
                  onClick={() => switchView(view === "wall" ? "grid" : "wall")}
                >
                  {view === "wall" ? (
                    <LayoutGrid size={20} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <StickyNote size={20} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn"
                aria-label={searchOpen ? "Close search" : "Search notes"}
                aria-expanded={searchOpen}
                onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              >
                {searchOpen ? (
                  <X size={20} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Search size={20} strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
              <MenuButton
                label="Account menu"
                align="end"
                buttonClassName="hit rounded-full"
                items={[
                  {
                    id: "logout",
                    label: "Log out",
                    icon: <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />,
                    onSelect: () => void logout(),
                  },
                ]}
              >
                <span className="avatar" aria-hidden="true">
                  M
                </span>
              </MenuButton>
            </div>
          </div>
        </header>

        <main
          className={`safe-x mx-auto w-full pb-[max(48px,env(safe-area-inset-bottom))] ${
            wallMode ? "max-w-none" : "max-w-[1200px]"
          }`}
        >
          <h1 className="mt-2 text-[32px] font-normal leading-[1.1] tracking-[-0.03em]">My Sticky Notes</h1>

          {status === "error" && detail ? (
            <p
              role="status"
              className="wrap-any mt-3 rounded-2xl border border-line bg-surface p-3 text-[13px] leading-relaxed text-danger"
            >
              <strong className="font-semibold">Sync problem.</strong> Your notes are safe on this device. {detail}
            </p>
          ) : null}

          {searchOpen ? (
            <div className="relative mt-4">
              <Search
                size={18}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeSearch();
                  }
                }}
                placeholder="Search titles, notes, folders, links"
                aria-label="Search notes"
                enterKeyHint="search"
                autoComplete="off"
                className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-12 text-[16px] text-ink placeholder:text-muted"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted"
                  aria-label="Clear search"
                >
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}

          <nav aria-label="Filters" className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <div className="flex w-max gap-2 py-1">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="chip"
                  aria-pressed={activeFilter === chip.key}
                  onClick={() => setFilter(chip.key)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </nav>

          {!ready ? (
            <section aria-label="Loading notes" className="mt-6">
              <h2 className="mb-3 text-[15px] font-medium text-ink/80">Notes</h2>
              <ul role="list" className={GRID} aria-busy="true">
                <li>
                  <AddNoteCard onClick={() => openNew()} />
                </li>
                {[0, 1, 2].map((index) => (
                  <li key={index}>
                    <NoteSkeleton />
                  </li>
                ))}
              </ul>
            </section>
          ) : wallMode ? (
            <>
              {visibleCount === 0 ? (
                <p className="mt-4 text-[15px] text-ink/70">{emptyMessage(activeFilter, query, notes.length > 0)}</p>
              ) : null}
              <Wall
                notes={wallNotes}
                now={now}
                onOpen={openNote}
                onNew={() => openNew()}
                onTrash={crumpleNote}
                trashed={trash}
                onPutBack={putBack}
                onEmptyTrash={emptyTrash}
              />
            </>
          ) : (
            <>
              {showComingUp ? (
                <section aria-labelledby="coming-up-title" className="mt-6">
                  <h2 id="coming-up-title" className="mb-3 text-[15px] font-medium text-ink/80">
                    Coming up
                  </h2>
                  <ul role="list" className={GRID}>
                    <li>
                      <AddNoteCard onClick={() => openNew()} />
                    </li>
                    {comingUp.map((note) => (
                      <li key={note.id}>
                        <NoteCard note={note} now={now} onOpen={openNote} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {others.length > 0 || !showComingUp ? (
                <section aria-labelledby="notes-title" className={showComingUp ? "mt-8" : "mt-6"}>
                  <h2 id="notes-title" className="mb-3 text-[15px] font-medium text-ink/80">
                    Notes
                  </h2>
                  {visibleCount === 0 ? (
                    <p className="mb-4 text-[15px] text-muted">
                      {emptyMessage(activeFilter, query, notes.length > 0)}
                    </p>
                  ) : null}
                  <ul role="list" className={GRID}>
                    {!showComingUp ? (
                      <li>
                        <AddNoteCard onClick={() => openNew()} />
                      </li>
                    ) : null}
                    {others.map((note) => (
                      <li key={note.id}>
                        <NoteCard note={note} now={now} onOpen={openNote} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </main>
      </div>

      {editor ? (
        <Sheet open={editorOpen} onRequestClose={closeEditor} onExited={unmountEditor} label="Edit note">
          <NoteEditor
            key={editor.note.id}
            note={editor.note}
            isNew={editor.isNew}
            startDirty={editor.startDirty}
            folders={folders}
            onClose={closeEditor}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </Sheet>
      ) : null}
    </>
  );
}
