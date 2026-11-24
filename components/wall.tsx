"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Trash, Undo2 } from "lucide-react";
import type { Note } from "@/lib/notes";
import { loadWall, saveWall, type WallSpot } from "@/lib/wall";
import { AddNoteCard, NoteCard } from "./note-card";

const CARD_W = 190;
const CARD_H = 238;
const GAP = 20;
/** Pixels the mouse must move before a press becomes a drag. */
const DRAG_START = 5;
/** Distance from the bin where a note starts to curl, and where letting go throws it away. */
const BIN_NEAR = 210;
const BIN_DROP = 95;
/** Wait this long for a second click before opening a note, so a double-click can stick it instead. */
const CLICK_DELAY_MS = 240;
const CRUMPLE_MS = 520;

interface WallProps {
  notes: Note[];
  now: number;
  onOpen: (note: Note) => void;
  onNew: () => void;
  /** Called after a note was dropped on the bin and its crumple animation finished. */
  onTrash: (note: Note) => void;
  trashed: Note[];
  onPutBack: (note: Note) => void;
  onEmptyTrash: () => void;
}

interface Placed {
  note: Note;
  left: number;
  top: number;
  stuck: boolean;
  order: number;
}

interface DragState {
  id: string;
  left: number;
  top: number;
  /** 0 = far from the bin, 1 = over it. */
  near: number;
}

interface CrumpleState {
  id: string;
  left: number;
  top: number;
  tx: number;
  ty: number;
}

interface Press {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A small, fixed tilt per note, so stuck notes look hand-placed. */
function tiltOf(id: string): number {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum += id.charCodeAt(index);
  const tilt = (sum % 7) - 3;
  return tilt === 0 ? 1.5 : tilt;
}

function binTitle(note: Note): string {
  const title = note.title.trim();
  if (title) return title;
  const line = note.content
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part !== "");
  return line ?? "Untitled";
}

/**
 * Notes on a wall. Drag a note to hang it anywhere, double-click to stick it down (or peel it off),
 * click to open it, and drop it on the bin to crumple it. The bin lists crumpled notes to put back.
 */
export function Wall({ notes, now, onOpen, onNew, onTrash, trashed, onPutBack, onEmptyTrash }: WallProps) {
  const [spots, setSpots] = useState<Record<string, WallSpot>>(() => loadWall());
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [crumple, setCrumple] = useState<CrumpleState | null>(null);
  const [binOpen, setBinOpen] = useState(false);

  const wallRef = useRef<HTMLDivElement>(null);
  const binRef = useRef<HTMLDivElement>(null);
  const binButtonRef = useRef<HTMLButtonElement>(null);
  const pressRef = useRef<Press | null>(null);
  const clickRef = useRef<{ id: string; timer: number } | null>(null);
  const suppressClickRef = useRef(false);
  const crumpleTimerRef = useRef<number | null>(null);
  const topZRef = useRef(0);
  const placedRef = useRef<Placed[]>([]);

  // Remember the layout on this device.
  useEffect(() => {
    saveWall(spots);
    let top = 0;
    for (const spot of Object.values(spots)) top = Math.max(top, spot.z);
    topZRef.current = Math.max(topZRef.current, top);
  }, [spots]);

  // Follow the wall's width, so positions adapt when the window is resized.
  useEffect(() => {
    const element = wallRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (clickRef.current) window.clearTimeout(clickRef.current.timer);
      if (crumpleTimerRef.current !== null) window.clearTimeout(crumpleTimerRef.current);
    };
  }, []);

  // The bin's list closes on Esc or a click outside it.
  useEffect(() => {
    if (!binOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = binRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setBinOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setBinOpen(false);
      binButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [binOpen]);

  const span = Math.max(0, width - CARD_W);

  // Notes without a saved place hang in rows, after the "+" card.
  const placed = useMemo<Placed[]>(() => {
    const columns = Math.max(1, Math.floor((width + GAP) / (CARD_W + GAP)));
    const ranked = notes
      .filter((note) => spots[note.id] !== undefined)
      .sort((a, b) => spots[a.id].z - spots[b.id].z)
      .map((note) => note.id);
    let slot = 1;
    return notes.map((note) => {
      const spot = spots[note.id];
      if (spot) {
        return {
          note,
          left: Math.round(clamp(spot.x, 0, 1) * span),
          top: Math.max(0, Math.round(spot.y)),
          stuck: spot.stuck,
          order: ranked.indexOf(note.id) + 2,
        };
      }
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      slot += 1;
      return { note, left: column * (CARD_W + GAP), top: row * (CARD_H + GAP), stuck: false, order: 1 };
    });
  }, [notes, spots, width, span]);

  useEffect(() => {
    placedRef.current = placed;
  });

  let lowest = CARD_H;
  for (const item of placed) lowest = Math.max(lowest, item.top + CARD_H);
  if (drag) lowest = Math.max(lowest, drag.top + CARD_H);

  const binCenter = (): { x: number; y: number } | null => {
    const button = binButtonRef.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const nearBin = (clientX: number, clientY: number): number => {
    const center = binCenter();
    if (!center) return 0;
    const distance = Math.hypot(clientX - center.x, clientY - center.y);
    return clamp(1 - (distance - BIN_DROP) / (BIN_NEAR - BIN_DROP), 0, 1);
  };

  const cancelPendingClick = () => {
    if (clickRef.current) {
      window.clearTimeout(clickRef.current.timer);
      clickRef.current = null;
    }
  };

  const toggleStuck = (id: string) => {
    const current = placedRef.current.find((item) => item.note.id === id);
    if (!current) return;
    const z = topZRef.current + 1;
    topZRef.current = z;
    setSpots((previous) => {
      const spot = previous[id];
      if (spot) return { ...previous, [id]: { ...spot, stuck: !spot.stuck, z } };
      return { ...previous, [id]: { x: span > 0 ? current.left / span : 0, y: current.top, stuck: true, z } };
    });
  };

  // One click opens the note after a short wait; a second click inside that wait sticks or peels it.
  const handleCardClick = (note: Note) => {
    if (suppressClickRef.current) return;
    const pending = clickRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      clickRef.current = null;
      if (pending.id === note.id) {
        toggleStuck(note.id);
        return;
      }
    }
    const timer = window.setTimeout(() => {
      clickRef.current = null;
      onOpen(note);
    }, CLICK_DELAY_MS);
    clickRef.current = { id: note.id, timer };
  };

  const positionFor = (press: Press, clientX: number, clientY: number): { left: number; top: number } => {
    const wall = wallRef.current;
    const rect = wall ? wall.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      left: clamp(clientX - rect.left - press.offsetX, 0, span),
      top: Math.max(0, clientY - rect.top - press.offsetY),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, item: Placed) => {
    if (event.button !== 0 || crumple) return;
    const target = event.target;
    if (target instanceof Element && target.closest("a")) return; // links stay clickable
    const wall = wallRef.current;
    if (!wall) return;
    const rect = wall.getBoundingClientRect();
    pressRef.current = {
      id: item.note.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left - item.left,
      offsetY: event.clientY - rect.top - item.top,
      dragging: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>, item: Placed) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.id !== item.note.id) return;
    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_START) return;
      press.dragging = true;
      cancelPendingClick();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; the drag simply ends on the next event.
      }
    }
    const { left, top } = positionFor(press, event.clientX, event.clientY);
    setDrag({ id: press.id, left, top, near: nearBin(event.clientX, event.clientY) });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>, item: Placed) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.id !== item.note.id) return;
    pressRef.current = null;
    if (!press.dragging) return; // a plain click: handled by handleCardClick

    // The browser sends a click after a drag; it must not open the note.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);

    const { left, top } = positionFor(press, event.clientX, event.clientY);
    setDrag(null);

    const center = binCenter();
    const wall = wallRef.current;
    if (center && wall && nearBin(event.clientX, event.clientY) >= 1) {
      const rect = wall.getBoundingClientRect();
      const note = item.note;
      setCrumple({
        id: note.id,
        left,
        top,
        tx: center.x - (rect.left + left + CARD_W / 2),
        ty: center.y - (rect.top + top + CARD_H / 2),
      });
      crumpleTimerRef.current = window.setTimeout(() => {
        crumpleTimerRef.current = null;
        setCrumple(null);
        onTrash(note);
      }, CRUMPLE_MS);
      return;
    }

    const z = topZRef.current + 1;
    topZRef.current = z;
    setSpots((previous) => ({
      ...previous,
      [press.id]: { x: span > 0 ? left / span : 0, y: top, stuck: previous[press.id]?.stuck ?? false, z },
    }));
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    pressRef.current = null;
    setDrag(null);
  };

  const binState = drag && drag.near > 0 ? (drag.near >= 1 ? "over" : "near") : undefined;

  return (
    <section aria-label="Notes wall" className="mt-4">
      <p className="text-[12px] font-medium text-ink/60">
        Drag a note to move it. Double-click to stick it to the wall. Drop it on the bin to throw it away.
      </p>

      <div ref={wallRef} className="wall mt-3" style={{ minHeight: `max(${lowest + 180}px, calc(100dvh - 240px))` }}>
        {width > 0 ? (
          <>
            <div className="wall-add" style={{ width: CARD_W }}>
              <AddNoteCard onClick={onNew} />
            </div>

            {placed.map((item) => {
              const id = item.note.id;
              const activeDrag = drag !== null && drag.id === id ? drag : null;
              const activeCrumple = crumple !== null && crumple.id === id ? crumple : null;
              const dragging = activeDrag !== null;
              const crumpling = activeCrumple !== null;
              const left = activeDrag ? activeDrag.left : activeCrumple ? activeCrumple.left : item.left;
              const top = activeDrag ? activeDrag.top : activeCrumple ? activeCrumple.top : item.top;
              const near = activeDrag ? activeDrag.near : 0;
              const classes = [
                "wall-note",
                dragging ? "wall-note--dragging" : "",
                dragging && near >= 1 ? "wall-note--balled" : "",
                crumpling ? "wall-note--crumple" : "",
              ]
                .filter((name) => name !== "")
                .join(" ");
              const style = {
                left,
                top,
                width: CARD_W,
                zIndex: dragging || crumpling ? 6000 : item.order,
                transform: dragging
                  ? `scale(${1.04 - 0.42 * near}) rotate(${Math.round(near * 16)}deg)`
                  : item.stuck
                    ? `rotate(${tiltOf(id)}deg)`
                    : undefined,
                "--tx": activeCrumple ? `${Math.round(activeCrumple.tx)}px` : "0px",
                "--ty": activeCrumple ? `${Math.round(activeCrumple.ty)}px` : "0px",
              } as CSSProperties;

              return (
                <div
                  key={id}
                  className={classes}
                  data-stuck={item.stuck ? "true" : "false"}
                  style={style}
                  onPointerDown={(event) => onPointerDown(event, item)}
                  onPointerMove={(event) => onPointerMove(event, item)}
                  onPointerUp={(event) => onPointerUp(event, item)}
                  onPointerCancel={onPointerCancel}
                >
                  <NoteCard note={item.note} now={now} onOpen={handleCardClick} />
                </div>
              );
            })}
          </>
        ) : null}

        <div className="wall-floor" aria-hidden="true" />

        <div ref={binRef} className="wall-bin" data-near={binState}>
          {binOpen ? (
            <div role="dialog" aria-label="Crumpled notes" className="popover bottom-full right-0 mb-3 w-72">
              <p className="px-3 pb-1 pt-2 text-[13px] font-semibold">Crumpled notes</p>
              {trashed.length > 0 ? (
                <ul className="max-h-64 overflow-y-auto">
                  {trashed.map((note) => (
                    <li key={note.id} className="flex min-h-11 items-center gap-2 px-3">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{binTitle(note)}</span>
                      <button
                        type="button"
                        className="pill pill-outline hit h-8 px-3 text-[12px]"
                        onClick={() => onPutBack(note)}
                        aria-label={`Put back: ${binTitle(note)}`}
                      >
                        <Undo2 size={14} strokeWidth={2.25} aria-hidden="true" />
                        Put back
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-[13px] text-muted">The bin is empty.</p>
              )}
              {trashed.length > 0 ? (
                <>
                  <div className="my-1 h-px bg-line" aria-hidden="true" />
                  <button
                    type="button"
                    className="menu-item"
                    data-tone="danger"
                    onClick={() => {
                      if (window.confirm("Empty the bin? These notes can't be put back afterwards.")) {
                        onEmptyTrash();
                        setBinOpen(false);
                      }
                    }}
                  >
                    <Trash size={17} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                    <span>Empty bin</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <button
            ref={binButtonRef}
            type="button"
            className="wall-bin__btn"
            aria-haspopup="dialog"
            aria-expanded={binOpen}
            aria-label={`Bin: ${trashed.length} crumpled ${trashed.length === 1 ? "note" : "notes"}. Show them`}
            title="Bin: drop a note here, or click to see crumpled notes"
            onClick={() => setBinOpen((value) => !value)}
          >
            <Trash size={30} strokeWidth={1.75} aria-hidden="true" />
            {trashed.length > 0 ? (
              <span className="wall-bin__count" aria-hidden="true">
                {trashed.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </section>
  );
}
