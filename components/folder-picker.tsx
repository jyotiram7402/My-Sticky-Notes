"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Folder, FolderPlus, X } from "lucide-react";
import { LIMITS } from "@/lib/notes";

interface FolderPickerProps {
  value: string | null;
  folders: string[];
  onChange: (folder: string | null) => void;
}

/** Outline "Add to folder" pill that opens a picker with existing folders and "New folder". */
export function FolderPicker({ value, folders, onChange }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const options = value && !folders.includes(value) ? [...folders, value].sort((a, b) => a.localeCompare(b)) : folders;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setCreating(false);
    setName("");
    if (restoreFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const firstButton = panelRef.current?.querySelector<HTMLElement>("button, input");
    firstButton?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
        setCreating(false);
        setName("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (folder: string | null) => {
    onChange(folder);
    close(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="pill pill-outline on-note-line hit max-w-[11rem]"
      >
        <Folder size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{value ?? "Add to folder"}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a folder"
          className="popover right-0 top-full mt-2 w-[min(17rem,calc(100vw_-_2rem))]"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
        >
          {options.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto">
              {options.map((folder) => (
                <li key={folder}>
                  <button
                    type="button"
                    className="menu-item"
                    aria-pressed={folder === value}
                    onClick={() => choose(folder)}
                  >
                    <Folder size={17} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{folder}</span>
                    {folder === value ? <Check size={17} strokeWidth={2.25} aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-[13px] text-muted">No folders yet.</p>
          )}

          {value ? (
            <button type="button" className="menu-item" onClick={() => choose(null)}>
              <X size={17} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>Remove from folder</span>
            </button>
          ) : null}

          <div className="my-1 h-px bg-line" aria-hidden="true" />

          {creating ? (
            <form
              className="flex items-center gap-2 p-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = name.trim().slice(0, LIMITS.folder);
                if (trimmed) choose(trimmed);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={LIMITS.folder}
                placeholder="Folder name"
                aria-label="New folder name"
                enterKeyHint="done"
                className="text-field"
              />
              <button type="submit" className="pill pill-black h-11 px-4" disabled={name.trim() === ""}>
                Add
              </button>
            </form>
          ) : (
            <button type="button" className="menu-item" onClick={() => setCreating(true)}>
              <FolderPlus size={17} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>New folder</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
