"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { Trash, Undo2 } from "lucide-react";
import { NOTE_COLOR_HEX, type Note } from "@/lib/notes";
import { loadWall, saveWall, type WallSpot } from "@/lib/wall";
import { AddNoteCard, NoteCard } from "./note-card";

const CARD_W = 190;
const CARD_H = 238;
const GAP = 20;
/** Distance from the bin where a held note starts to shrink, and where letting go throws it away. */
const BIN_NEAR = 250;
const BIN_DROP = 115;
/** Wait this long for a second click before opening a note, so a double-click can stick it instead. */
const CLICK_DELAY_MS = 240;
const EFFECT_MS = 700;
const ENTER_WINDOW_MS = 1200;
/** Size of a held note, of the paper ball in the hand, and of the ball as it reaches the bin. */
const HELD_SCALE = 1.07;
const BALL_SCALE = 0.64;
const LAND_SCALE = 0.46;
const TOSS_SECONDS = 0.62;
const UNFOLD_SECONDS = 0.74;
/** A note let go faster than this (pixels per second) and aimed at the bin is thrown into it. */
const FLICK_SPEED = 900;

const LIFT_SPRING = { type: "spring" as const, stiffness: 420, damping: 24 };
const FOLLOW_SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };
const TILT_SPRING = { stiffness: 260, damping: 20, mass: 0.6 };

type EffectKind = "settle" | "slap" | "peel";

interface WallProps {
  notes: Note[];
  now: number;
  onOpen: (note: Note) => void;
  onNew: () => void;
  /** Called after a note was thrown into the bin and its flight finished. */
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

/** The bin as seen from the wall: where a ball lands, and the bin's middle. */
interface BinTarget {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** What a note needs from the wall it hangs on. */
interface WallApi {
  nearBin: (clientX: number, clientY: number) => number;
  binTarget: () => BinTarget | null;
  setNear: (near: number | null) => void;
  suppressClicks: (on: boolean) => void;
  cancelClick: () => void;
  moved: (id: string, left: number, top: number, final: boolean) => void;
  tossed: (note: Note) => void;
  click: (note: Note) => void;
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

function clientPoint(event: MouseEvent | TouchEvent | PointerEvent): { x: number; y: number } | null {
  if ("clientX" in event) return { x: event.clientX, y: event.clientY };
  const touch = event.changedTouches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

const BIN_BALLS = [
  { cx: 33, cy: 17, r: 12, crease: "M25 14l8 5 7-7M30 25l4-6" },
  { cx: 57, cy: 14, r: 13, crease: "M48 12l9 4 8-6M54 24l3-8" },
  { cx: 45, cy: 11, r: 11, crease: "M38 9l7 4 7-5M43 19l3-6" },
];

// ---------------------------------------------------------------------------
// One note on the wall

interface WallNoteProps {
  item: Placed;
  index: number;
  now: number;
  /** Farthest a note can go to the right and down. */
  span: number;
  floor: number;
  /** The wall has just appeared: drop in from above. */
  entering: boolean;
  /** The note was just taken out of the bin: fly out of it and unfold. */
  cameBack: boolean;
  effect: EffectKind | null;
  api: WallApi;
}

/**
 * A sheet of paper with weight. It is held by its top edge, so it swings behind the mouse; let go
 * while moving and it glides on and bumps softly against the edge of the wall; flick it at the bin
 * and it scrunches up and flies in. Under a still mouse it tilts toward the pointer and catches light.
 */
function WallNote({ item, index, now, span, floor, entering, cameBack, effect, api }: WallNoteProps) {
  const reduce = useReducedMotion() === true;
  const id = item.note.id;

  // How this note first appears. Decided once, when it is hung.
  const [start] = useState(() => {
    const bin = cameBack && !reduce ? api.binTarget() : null;
    if (bin) return { mode: "unfold" as const, x: bin.x, y: bin.y, lift: LAND_SCALE, fade: 0, turn: 0 };
    if (entering && !reduce) {
      return { mode: "enter" as const, x: item.left, y: item.top - 90, lift: 1.08, fade: 0, turn: -9 };
    }
    return {
      mode: "none" as const,
      x: item.left,
      y: item.top,
      lift: 1,
      fade: 1,
      turn: item.stuck ? tiltOf(id) : 0,
    };
  });

  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const lift = useMotionValue(start.lift);
  const fade = useMotionValue(start.fade);
  const turn = useMotionValue(start.turn);

  // Swing: the sheet leans with its sideways speed and springs back when it stops.
  const speed = useVelocity(x);
  const lean = useTransform(speed, [-1700, 0, 1700], [-16, 0, 16]);
  const swing = useSpring(lean, { stiffness: 210, damping: 11, mass: 0.7 });

  // Tilt toward the mouse, with a highlight that follows it.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const glow = useMotionValue(0);
  const tiltX = useSpring(useTransform(pointerY, [-0.5, 0.5], [9, -9]), TILT_SPRING);
  const tiltY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-11, 11]), TILT_SPRING);
  const sheenX = useTransform(pointerX, [-0.5, 0.5], [-95, 95]);
  const sheenY = useTransform(pointerY, [-0.5, 0.5], [-119, 119]);
  const sheen = useSpring(glow, { stiffness: 200, damping: 26 });

  const [held, setHeld] = useState(false);
  const [balled, setBalled] = useState(false);
  const [tossing, setTossing] = useState(false);
  const [unfolding, setUnfolding] = useState(start.mode === "unfold");

  /** True while the note moves by itself or in the hand; the wall's layout is not followed then. */
  const busyRef = useRef(start.mode !== "none");
  const tossRef = useRef(false);
  const wasNearRef = useRef(false);
  const restRef = useRef({ left: item.left, top: item.top, turn: item.stuck ? tiltOf(id) : 0 });
  const timersRef = useRef<number[]>([]);
  const firstStuckRef = useRef(true);

  useEffect(() => {
    restRef.current = { left: item.left, top: item.top, turn: item.stuck ? tiltOf(id) : 0 };
  });

  const later = (callback: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(callback, ms));
  };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  // First appearance: drop onto the wall, or fly out of the bin and open up.
  useEffect(() => {
    if (start.mode === "none") return;
    const rest = restRef.current;
    if (start.mode === "enter") {
      const delay = Math.min(index * 0.06, 0.5);
      const controls = [
        animate(y, rest.top, { type: "spring", stiffness: 240, damping: 17, delay }),
        animate(lift, 1, { type: "spring", stiffness: 240, damping: 20, delay }),
        animate(turn, rest.turn, { type: "spring", stiffness: 180, damping: 9, delay }),
        animate(fade, 1, { duration: 0.22, delay }),
      ];
      const timer = window.setTimeout(() => {
        busyRef.current = false;
      }, delay * 1000 + 800);
      return () => {
        window.clearTimeout(timer);
        for (const control of controls) control.stop();
      };
    }
    const controls = [
      animate(x, rest.left, { duration: UNFOLD_SECONDS, ease: [0.16, 1, 0.3, 1] }),
      animate(y, [start.y, Math.min(start.y, rest.top) - 70, rest.top], {
        duration: UNFOLD_SECONDS,
        times: [0, 0.4, 1],
        ease: ["easeOut", "easeInOut"],
      }),
      animate(lift, [LAND_SCALE, 0.8, 1], { duration: UNFOLD_SECONDS, times: [0, 0.5, 1], ease: "easeOut" }),
      animate(turn, rest.turn, { duration: UNFOLD_SECONDS }),
      animate(fade, 1, { duration: 0.12 }),
    ];
    const timer = window.setTimeout(() => {
      busyRef.current = false;
      setUnfolding(false);
    }, UNFOLD_SECONDS * 1000 + 40);
    return () => {
      window.clearTimeout(timer);
      for (const control of controls) control.stop();
    };
    // Runs once, with the values the note was hung with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the wall when the note's place changes without being dragged (window resize, reflow).
  useEffect(() => {
    if (busyRef.current) return;
    if (Math.abs(x.get() - item.left) < 0.5 && Math.abs(y.get() - item.top) < 0.5) return;
    const controls = [animate(x, item.left, FOLLOW_SPRING), animate(y, item.top, FOLLOW_SPRING)];
    return () => {
      for (const control of controls) control.stop();
    };
  }, [item.left, item.top, x, y]);

  // Taped notes sit at a slight angle; loose ones hang straight.
  useEffect(() => {
    if (firstStuckRef.current) {
      firstStuckRef.current = false;
      return;
    }
    const control = animate(turn, item.stuck ? tiltOf(id) : 0, { type: "spring", stiffness: 300, damping: 14 });
    return () => control.stop();
  }, [item.stuck, id, turn]);

  const calmPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
    glow.set(0);
  };

  const handleDragStart = () => {
    busyRef.current = true;
    tossRef.current = false;
    wasNearRef.current = false;
    api.cancelClick();
    api.suppressClicks(true);
    calmPointer();
    setHeld(true);
    animate(lift, HELD_SCALE, LIFT_SPRING);
  };

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent) => {
    const point = clientPoint(event);
    if (!point) return;
    const near = api.nearBin(point.x, point.y);
    if (near > 0) {
      // Close to the bin the sheet shrinks in the hand, down to the size of the ball.
      lift.stop();
      lift.set(HELD_SCALE - (HELD_SCALE - BALL_SCALE) * near);
      wasNearRef.current = true;
    } else if (wasNearRef.current) {
      wasNearRef.current = false;
      animate(lift, HELD_SCALE, LIFT_SPRING);
    }
    setBalled(near >= 1);
    api.setNear(near);
  };

  const toss = (bin: BinTarget) => {
    tossRef.current = true;
    setBalled(true);
    setTossing(true);
    if (reduce) {
      api.tossed(item.note);
      return;
    }
    // Start on the next frame, after the library has begun (and so can be taken over from) its glide.
    window.requestAnimationFrame(() => {
      const fromY = y.get();
      const apex = Math.min(fromY, bin.y) - 110;
      animate(x, bin.x, { duration: TOSS_SECONDS * 0.86, ease: [0.3, 0.2, 0.7, 1] });
      animate(y, [fromY, apex, bin.y, bin.y + 34], {
        duration: TOSS_SECONDS,
        times: [0, 0.42, 0.86, 1],
        ease: ["easeOut", "easeIn", "linear"],
      });
      animate(lift, [lift.get(), 0.56, LAND_SCALE, 0.4], { duration: TOSS_SECONDS, times: [0, 0.42, 0.86, 1] });
      animate(turn, turn.get() + 620, { duration: TOSS_SECONDS, ease: "linear" });
      animate(fade, [1, 1, 0], { duration: TOSS_SECONDS, times: [0, 0.86, 1] });
      later(() => api.tossed(item.note), TOSS_SECONDS * 1000);
    });
  };

  /** The note has stopped gliding: it stays where it is, unless it came to rest at the bin. */
  const finishMove = () => {
    if (tossRef.current || !busyRef.current) return;
    const bin = api.binTarget();
    if (bin && Math.hypot(x.get() + CARD_W / 2 - bin.cx, y.get() + CARD_H / 2 - bin.cy) < BIN_DROP + 30) {
      toss(bin);
      return;
    }
    busyRef.current = false;
    api.moved(id, x.get(), y.get(), true);
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent) => {
    setHeld(false);
    api.setNear(null);
    later(() => api.suppressClicks(false), 80);

    const point = clientPoint(event);
    const near = point ? api.nearBin(point.x, point.y) : 0;
    const bin = api.binTarget();
    let thrown = near >= 1;
    if (!thrown && bin && !reduce) {
      // A flick: fast, and aimed at the bin.
      const velocityX = x.getVelocity();
      const velocityY = y.getVelocity();
      const flick = Math.hypot(velocityX, velocityY);
      if (flick > FLICK_SPEED) {
        const dx = bin.cx - (x.get() + CARD_W / 2);
        const dy = bin.cy - (y.get() + CARD_H / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const aim = (velocityX * dx + velocityY * dy) / (flick * distance);
        if (aim > 0.9 && distance < flick * 0.9) thrown = true;
      }
    }
    if (thrown && bin) {
      toss(bin);
      return;
    }

    setBalled(false);
    animate(lift, 1, LIFT_SPRING);
    api.moved(id, x.get(), y.get(), false);
    // The glide normally reports its own end; this is the fallback if it does not.
    later(finishMove, 1800);
  };

  const handleTiltMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || held || tossing || unfolding || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerX.set(clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5));
    pointerY.set(clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5));
    glow.set(1);
  };

  const classes = ["wall-note"];
  if (held) classes.push("wall-note--dragging");
  if (balled && !tossing) classes.push("wall-note--balled");
  if (tossing) classes.push("wall-note--toss");
  if (unfolding) classes.push("wall-note--unfold");
  if (effect && !held && !tossing && !unfolding) classes.push(`wall-note--${effect}`);

  return (
    <motion.div
      className={classes.join(" ")}
      data-stuck={item.stuck ? "true" : "false"}
      style={{
        x,
        y,
        rotate: swing,
        scale: lift,
        opacity: fade,
        originY: 0,
        width: CARD_W,
        zIndex: held || tossing || unfolding ? 6000 : item.order,
      }}
      drag={!tossing && !unfolding}
      dragMomentum={!reduce}
      dragElastic={0.1}
      dragConstraints={{ left: 0, right: span, top: 0, bottom: floor }}
      dragTransition={{ power: 0.24, timeConstant: 260, bounceStiffness: 320, bounceDamping: 24 }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onDragTransitionEnd={finishMove}
    >
      <motion.div
        className="wall-note__tilt"
        style={{ rotate: turn, rotateX: tiltX, rotateY: tiltY, transformPerspective: 700 }}
        onPointerMove={handleTiltMove}
        onPointerLeave={calmPointer}
      >
        <NoteCard note={item.note} now={now} onOpen={api.click} />
        <div className="wall-note__sheen" aria-hidden="true">
          <motion.div style={{ x: sheenX, y: sheenY, opacity: sheen }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The wall

/**
 * Notes on a study wall. Drag a note to hang it anywhere, throw it and it glides, double-click to
 * tape it down or peel it off, click to open it, and drop or flick it at the bin to scrunch it up.
 * The bin lists crumpled notes, which fly back out and unfold where they hung.
 */
export function Wall({ notes, now, onOpen, onNew, onTrash, trashed, onPutBack, onEmptyTrash }: WallProps) {
  const [spots, setSpots] = useState<Record<string, WallSpot>>(() => loadWall());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [near, setNear] = useState<number | null>(null);
  const [effect, setEffect] = useState<{ id: string; kind: EffectKind } | null>(null);
  const [entering, setEntering] = useState(true);
  const [catching, setCatching] = useState(false);
  const [binOpen, setBinOpen] = useState(false);

  const wallRef = useRef<HTMLDivElement>(null);
  const binRef = useRef<HTMLDivElement>(null);
  const binButtonRef = useRef<HTMLButtonElement>(null);
  const clickRef = useRef<{ id: string; timer: number } | null>(null);
  const suppressClickRef = useRef(false);
  const topZRef = useRef(0);
  const placedRef = useRef<Placed[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const wasTrashedRef = useRef<Set<string>>(new Set());
  const effectTimerRef = useRef<number | null>(null);
  const catchTimerRef = useRef<number | null>(null);

  const width = size.width;

  // Remember the layout on this device.
  useEffect(() => {
    saveWall(spots);
    let top = 0;
    for (const spot of Object.values(spots)) top = Math.max(top, spot.z);
    topZRef.current = Math.max(topZRef.current, top);
  }, [spots]);

  // Follow the wall's size, so positions adapt when the window is resized.
  useEffect(() => {
    const element = wallRef.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize((previous) => (previous.width === next.width && previous.height === next.height ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Notes drop onto the wall one after another when the wall first appears.
  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), ENTER_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (clickRef.current) window.clearTimeout(clickRef.current.timer);
      if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current);
      if (catchTimerRef.current !== null) window.clearTimeout(catchTimerRef.current);
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
  const floor = Math.max(0, size.height - CARD_H);

  // Notes without a saved place hang in rows, after the "+" card.
  const placed = useMemo<Placed[]>(() => {
    const columns = Math.max(1, Math.floor((width + GAP) / (CARD_W + GAP)));
    const ranked = notes
      .filter((note) => spots[note.id] !== undefined)
      .sort((a, b) => spots[a.id].z - spots[b.id].z)
      .map((note) => note.id);
    return notes.map((note, index) => {
      // Every note keeps its own slot, so moving one note never makes the others jump.
      const slot = index + 1;
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
      return { note, left: column * (CARD_W + GAP), top: row * (CARD_H + GAP), stuck: false, order: 1 };
    });
  }, [notes, spots, width, span]);

  // Which notes were on the wall, and which were in the bin, the last time the wall was drawn.
  // A note that is new on the wall and was in the bin has been put back.
  const seenBefore = seenRef.current;
  const trashedBefore = wasTrashedRef.current;
  useEffect(() => {
    placedRef.current = placed;
    if (width > 0) seenRef.current = new Set(placed.map((item) => item.note.id));
    wasTrashedRef.current = new Set(trashed.map((note) => note.id));
  });

  let lowest = CARD_H;
  for (const item of placed) lowest = Math.max(lowest, item.top + CARD_H);

  const playEffect = (id: string, kind: EffectKind) => {
    setEffect({ id, kind });
    if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current);
    effectTimerRef.current = window.setTimeout(() => {
      effectTimerRef.current = null;
      setEffect(null);
    }, EFFECT_MS);
  };

  const cancelClick = () => {
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
    playEffect(id, current.stuck ? "peel" : "slap");
    setSpots((previous) => {
      const spot = previous[id];
      if (spot) return { ...previous, [id]: { ...spot, stuck: !spot.stuck, z } };
      return { ...previous, [id]: { x: span > 0 ? current.left / span : 0, y: current.top, stuck: true, z } };
    });
  };

  const api: WallApi = {
    nearBin: (clientX, clientY) => {
      const button = binButtonRef.current;
      if (!button) return 0;
      const rect = button.getBoundingClientRect();
      const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
      return clamp(1 - (distance - BIN_DROP) / (BIN_NEAR - BIN_DROP), 0, 1);
    },
    binTarget: () => {
      const button = binButtonRef.current;
      const wall = wallRef.current;
      if (!button || !wall) return null;
      const bin = button.getBoundingClientRect();
      const rect = wall.getBoundingClientRect();
      const mouthX = bin.left + bin.width / 2 - rect.left;
      const mouthY = bin.top + bin.height * 0.2 - rect.top;
      return {
        x: mouthX - CARD_W / 2,
        y: mouthY - (CARD_H / 2) * LAND_SCALE,
        cx: mouthX,
        cy: bin.top + bin.height / 2 - rect.top,
      };
    },
    setNear,
    suppressClicks: (on) => {
      suppressClickRef.current = on;
    },
    cancelClick,
    // Called when a note is let go (final = false) and again when it has stopped gliding.
    moved: (id, left, top, final) => {
      const z = final ? null : topZRef.current + 1;
      if (z !== null) topZRef.current = z;
      if (final) playEffect(id, "settle");
      setSpots((previous) => {
        const spot = previous[id];
        return {
          ...previous,
          [id]: {
            x: span > 0 ? clamp(left / span, 0, 1) : 0,
            y: Math.max(0, top),
            stuck: spot ? spot.stuck : false,
            z: z ?? (spot ? spot.z : topZRef.current),
          },
        };
      });
    },
    tossed: (note) => {
      onTrash(note);
      setCatching(true);
      if (catchTimerRef.current !== null) window.clearTimeout(catchTimerRef.current);
      catchTimerRef.current = window.setTimeout(() => {
        catchTimerRef.current = null;
        setCatching(false);
      }, 520);
    },
    // One click opens the note after a short wait; a second click inside that wait tapes or peels it.
    click: (note) => {
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
    },
  };

  const binState = near !== null && near > 0 ? (near >= 1 ? "over" : "near") : undefined;
  const balls = trashed.slice(0, BIN_BALLS.length);

  return (
    <section aria-label="Notes wall" className="mt-4">
      <p className="text-[12px] font-medium text-ink/65">
        Drag a note to move it, or throw it. Double-click to tape it to the wall. Drop or flick it at the bin to
        throw it away.
      </p>

      <div ref={wallRef} className="wall mt-3" style={{ minHeight: `max(${lowest + 220}px, calc(100dvh - 240px))` }}>
        {width > 0 ? (
          <>
            <div className="wall-add" style={{ width: CARD_W }}>
              <AddNoteCard onClick={onNew} />
            </div>

            {placed.map((item, index) => {
              const id = item.note.id;
              return (
                <WallNote
                  key={id}
                  item={item}
                  index={index}
                  now={now}
                  span={span}
                  floor={floor}
                  entering={entering}
                  cameBack={seenBefore !== null && !seenBefore.has(id) && trashedBefore.has(id)}
                  effect={effect !== null && effect.id === id ? effect.kind : null}
                  api={api}
                />
              );
            })}
          </>
        ) : null}

        <div className="wall-floor" aria-hidden="true" />

        <div ref={binRef} className={catching ? "wall-bin wall-bin--catch" : "wall-bin"} data-near={binState}>
          {binOpen ? (
            <div role="dialog" aria-label="Crumpled notes" className="popover bottom-full right-0 mb-3 w-72">
              <p className="px-3 pb-1 pt-2 text-[13px] font-semibold">Crumpled notes</p>
              {trashed.length > 0 ? (
                <ul className="max-h-64 overflow-y-auto">
                  {trashed.map((note) => (
                    <li key={note.id} className="flex min-h-11 items-center gap-2 px-3">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: NOTE_COLOR_HEX[note.color],
                          boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.14)",
                        }}
                        aria-hidden="true"
                      />
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
            <svg viewBox="0 0 92 106" aria-hidden="true" focusable="false">
              <defs>
                <pattern
                  id="wall-bin-mesh"
                  width="9"
                  height="9"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <path d="M0 0H9M0 0V9" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.2" fill="none" />
                </pattern>
                <linearGradient id="wall-bin-metal" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#2f3238" />
                  <stop offset="0.36" stopColor="#50555e" />
                  <stop offset="1" stopColor="#25272c" />
                </linearGradient>
              </defs>
              <ellipse cx="46" cy="20" rx="40" ry="10" fill="#1b1d21" />
              <path d="M6 20A40 10 0 0 1 86 20" stroke="#5a5f68" strokeWidth="3" fill="none" />
              {balls.map((note, index) => {
                const ball = BIN_BALLS[index];
                return (
                  <g key={note.id} className="wall-bin__ball">
                    <circle cx={ball.cx} cy={ball.cy} r={ball.r} fill={NOTE_COLOR_HEX[note.color]} />
                    <path
                      d={ball.crease}
                      stroke="#000000"
                      strokeOpacity="0.22"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
              <path d="M6 20A40 10 0 0 0 86 20L76 96Q46 106 16 96Z" fill="url(#wall-bin-metal)" />
              <path d="M6 20A40 10 0 0 0 86 20L76 96Q46 106 16 96Z" fill="url(#wall-bin-mesh)" />
              <path d="M6 20A40 10 0 0 0 86 20" stroke="#7a808a" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M16 96Q46 106 76 96" stroke="#17181b" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
            {trashed.length > 0 ? (
              <span key={trashed.length} className="wall-bin__count" aria-hidden="true">
                {trashed.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </section>
  );
}
