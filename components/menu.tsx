"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface MenuButtonProps {
  /** Accessible name of the trigger button. */
  label: string;
  items: MenuItem[];
  children: ReactNode;
  align?: "start" | "end";
  buttonClassName?: string;
}

/** A button that opens a small popover menu (arrow keys, Home/End, Esc and click-outside supported). */
export function MenuButton({ label, items, children, align = "start", buttonClassName = "" }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const firstEnabled = itemRefs.current.find((item) => item !== null && !item.disabled);
    firstEnabled?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const enabledItems = () =>
    itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {children}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`popover top-full mt-2 ${align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
          onKeyDown={(event) => {
            const list = enabledItems();
            if (list.length === 0) return;
            const index = list.findIndex((item) => item === document.activeElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              list[(index + 1) % list.length].focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              list[index <= 0 ? list.length - 1 : index - 1].focus();
            } else if (event.key === "Home") {
              event.preventDefault();
              list[0].focus();
            } else if (event.key === "End") {
              event.preventDefault();
              list[list.length - 1].focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              data-tone={item.tone ?? "default"}
              className="menu-item"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
                item.onSelect();
              }}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
