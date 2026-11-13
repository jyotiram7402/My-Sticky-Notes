"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EXIT_MS = 260;
const NOT_DRAGGABLE = "button, a, input, textarea, select, label, .popover";

interface SheetProps {
  open: boolean;
  /** Called on Esc, backdrop tap or swipe down. The parent then sets `open` to false. */
  onRequestClose: () => void;
  /** Called once the closing animation has finished, so the parent can unmount the sheet. */
  onExited: () => void;
  label: string;
  variant?: "full" | "compact";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Bottom sheet on phones (slides up, grab handle, swipe down to close) and a centered dialog
 * on laptops. Mark the swipeable area with `data-drag-zone` and the first field with `data-autofocus`.
 */
export function Sheet({
  open,
  onRequestClose,
  onExited,
  label,
  variant = "full",
  className = "",
  style,
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ pointerId: number; startY: number; startTime: number } | null>(null);
  const closeRef = useRef(onRequestClose);
  const exitedRef = useRef(onExited);

  useEffect(() => {
    closeRef.current = onRequestClose;
    exitedRef.current = onExited;
  });

  // Enter on the frame after mount so the slide-in transition runs; exit, then tell the parent.
  useEffect(() => {
    if (open) {
      let second = 0;
      const first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => setShown(true));
      });
      return () => {
        window.cancelAnimationFrame(first);
        window.cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const timer = window.setTimeout(() => exitedRef.current(), prefersReducedMotion() ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Lock page scroll, move focus in, and give focus back on unmount.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus({ preventScroll: true });

    return () => {
      root.style.overflow = previousOverflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Esc closes. Menus inside the sheet handle Esc first and mark the event as handled.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  // Keep Tab inside the sheet.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getClientRects().length > 0,
    );
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Swipe down to close (phones only, from the drag zone).
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || window.matchMedia("(min-width: 768px)").matches) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-drag-zone]") || target.closest(NOT_DRAGGABLE)) return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startTime: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDragY(Math.max(0, event.clientY - drag.startY));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = distance / Math.max(1, performance.now() - drag.startTime);
    setDragY(0);
    if (distance > 120 || (distance > 40 && velocity > 0.5)) closeRef.current();
  };

  const panelStyle: CSSProperties =
    dragY > 0 ? { ...style, transform: `translate3d(0, ${dragY}px, 0)`, transition: "none" } : { ...style };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-40" data-state={shown ? "open" : "closed"}>
      <div className="sheet-backdrop absolute inset-0" aria-hidden="true" onClick={() => closeRef.current()} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          data-variant={variant}
          className={`sheet-panel pointer-events-auto relative flex w-full flex-col ${className}`}
          style={panelStyle}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
