"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Check, Copy, CopyPlus, Ellipsis, Pin, Share, Trash } from "lucide-react";
import {
  LIMITS,
  NOTE_COLOR_HEX,
  TEXT_COLOR_HEX,
  defaultTextColor,
  isEmptyNote,
  noteAsText,
  type Note,
} from "@/lib/notes";
import { noteLinks } from "@/lib/links";
import { formatEdited } from "@/lib/format";
import { removeNote, saveNote } from "@/lib/store";
import { copyText } from "@/lib/clipboard";
import { useToast } from "./toast";
import { MenuButton, type MenuItem } from "./menu";
import { FolderPicker } from "./folder-picker";
import { LinksRow } from "./links-row";
import { DueDateField } from "./due-date-field";
import { ColorPicker } from "./color-picker";
import { IconPicker } from "./icon-picker";

const AUTOSAVE_MS = 600;

export interface NoteEditorProps {
  note: Note;
  isNew: boolean;
  /** Save even if nothing is typed (a note created from the share sheet). */
  startDirty: boolean;
  folders: string[];
  onClose: () => void;
  onDelete: (note: Note, persisted: boolean) => void;
  onDuplicate: (note: Note) => void;
}

/** Grows a textarea with its content where CSS `field-sizing: content` is not supported. */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")) {
      return;
    }
    const scroller = element.closest<HTMLElement>("[data-scroll-container]");
    const scrollTop = scroller ? scroller.scrollTop : 0;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    if (scroller) scroller.scrollTop = scrollTop;
  }, [ref, value]);
}

/**
 * Colored note editor. Changes autosave after a short pause (no save button), and are saved
 * again when the sheet closes or the page is hidden. A new note left empty is discarded on close.
 */
export function NoteEditor({ note, isNew, startDirty, folders, onClose, onDelete, onDuplicate }: NoteEditorProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<Note>(note);
  const [savedAt, setSavedAt] = useState<string>(note.updatedAt);
  const [persisted, setPersisted] = useState<boolean>(!isNew);

  const draftRef = useRef<Note>(note);
  const dirtyRef = useRef<boolean>(startDirty);
  const persistedRef = useRef<boolean>(!isNew);
  const deletedRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useAutoGrow(titleRef, draft.title);
  useAutoGrow(contentRef, draft.content);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(() => {
    clearTimer();
    if (deletedRef.current || !dirtyRef.current) return;
    const current = draftRef.current;
    if (!persistedRef.current && isEmptyNote(current)) return; // nothing worth saving yet
    const saved: Note = { ...current, updatedAt: new Date().toISOString() };
    draftRef.current = saved;
    dirtyRef.current = false;
    persistedRef.current = true;
    saveNote(saved, { isNew });
    setSavedAt(saved.updatedAt);
    setPersisted(true);
  }, [clearTimer, isNew]);

  const schedule = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commit();
    }, AUTOSAVE_MS);
  }, [clearTimer, commit]);

  const update = useCallback(
    (patch: Partial<Note>) => {
      const next: Note = { ...draftRef.current, ...patch };
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      schedule();
    },
    [schedule],
  );

  // A note from the share sheet is saved even if nothing else is typed.
  useEffect(() => {
    if (startDirty) schedule();
  }, [startDirty, schedule]);

  // Save before the page is hidden: app switch, tab close or a redirect.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") commit();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", commit);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", commit);
    };
  }, [commit]);

  // When the editor goes away: save what is left, or discard a new note that was left empty.
  useEffect(() => {
    return () => {
      if (deletedRef.current) return;
      const current = draftRef.current;
      if (isNew && isEmptyNote(current)) {
        clearTimer();
        if (persistedRef.current) removeNote(current.id);
        return;
      }
      commit();
    };
  }, [clearTimer, commit, isNew]);

  const handleDelete = () => {
    clearTimer();
    deletedRef.current = true;
    const current = draftRef.current;
    const latest: Note = dirtyRef.current ? { ...current, updatedAt: new Date().toISOString() } : current;
    onDelete(latest, persistedRef.current);
  };

  const handleDuplicate = () => {
    commit();
    onDuplicate(draftRef.current);
  };

  const handleCopy = async () => {
    const text = noteAsText(draftRef.current);
    if (!text) {
      toast.show({ message: "Nothing to copy yet" });
      return;
    }
    toast.show({ message: (await copyText(text)) ? "Copied" : "Couldn't copy" });
  };

  const handleShare = async () => {
    const current = draftRef.current;
    const text = noteAsText(current);
    if (!text) {
      toast.show({ message: "Nothing to share yet" });
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: current.title.trim() || undefined, text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    toast.show({ message: (await copyText(text)) ? "Copied to clipboard" : "Couldn't share this note" });
  };

  const addLink = (href: string): boolean => {
    const current = draftRef.current;
    if (noteLinks(current).includes(href)) {
      toast.show({ message: "That link is already here" });
      return true;
    }
    const base = current.content.replace(/\s+$/, "");
    const content = base ? `${base}\n${href}` : href;
    if (content.length > LIMITS.content) {
      toast.show({ message: "This note is full" });
      return false;
    }
    update({ content });
    return true;
  };

  const links = noteLinks(draft);
  const empty = isEmptyNote(draft);
  const background = NOTE_COLOR_HEX[draft.color];
  const foreground = TEXT_COLOR_HEX[draft.textColor];
  const darkText = draft.textColor === "dark";
  const nearLimit = draft.content.length > LIMITS.content * 0.9;

  const menuItems: MenuItem[] = [
    {
      id: "duplicate",
      label: "Duplicate",
      icon: <CopyPlus size={18} strokeWidth={1.75} aria-hidden="true" />,
      onSelect: handleDuplicate,
      disabled: empty,
    },
    {
      id: "copy",
      label: "Copy text",
      icon: <Copy size={18} strokeWidth={1.75} aria-hidden="true" />,
      onSelect: () => void handleCopy(),
      disabled: empty,
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Trash size={18} strokeWidth={1.75} aria-hidden="true" />,
      onSelect: handleDelete,
      tone: "danger",
    },
  ];

  const themeStyle = {
    backgroundColor: background,
    color: foreground,
    "--note-bg": background,
    "--note-fg": foreground,
    "--pill-bg": darkText ? "#000000" : "#FFFFFF",
    "--pill-fg": darkText ? "#FFFFFF" : "#111111",
  } as CSSProperties;

  return (
    <div className="on-note editor-surface flex min-h-0 flex-1 flex-col" style={themeStyle}>
      {/* Top row (also the swipe-down area on phones) */}
      <div data-drag-zone className="shrink-0 touch-none select-none px-4 pb-2 pt-2.5 md:px-6 md:pt-5">
        <div className="on-note-handle mx-auto mb-2.5 h-1.5 w-10 rounded-full md:hidden" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <MenuButton label="More options" items={menuItems} buttonClassName="icon-btn">
            <Ellipsis size={20} strokeWidth={2} aria-hidden="true" />
          </MenuButton>
          <button type="button" onClick={() => void handleShare()} className="pill on-note-pill hit">
            Share
            <Share size={14} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <FolderPicker value={draft.folder} folders={folders} onChange={(folder) => update({ folder })} />
            <button
              type="button"
              onClick={handleDelete}
              className="icon-btn icon-btn--ghost"
              aria-label="Delete note"
              title="Delete note"
            >
              <Trash size={20} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-3 md:px-7">
        <textarea
          ref={titleRef}
          rows={1}
          value={draft.title}
          maxLength={LIMITS.title}
          placeholder="New note"
          aria-label="Title"
          enterKeyHint="next"
          data-autofocus={isNew ? "" : undefined}
          onChange={(event) => update({ title: event.target.value.replace(/[\r\n]+/g, " ") })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              contentRef.current?.focus();
            }
          }}
          className="editor-title on-note-input"
        />
        <textarea
          ref={contentRef}
          rows={4}
          value={draft.content}
          maxLength={LIMITS.content}
          placeholder="Write notes here..."
          aria-label="Note"
          onChange={(event) => update({ content: event.target.value })}
          className="editor-content on-note-input mt-3"
        />
        {nearLimit ? (
          <p className="on-note-muted mt-1 text-right text-[12px] tabular-nums">
            {draft.content.length.toLocaleString()} / {LIMITS.content.toLocaleString()}
          </p>
        ) : null}

        <div className="mt-6 space-y-7">
          <LinksRow links={links} onAdd={addLink} />
          <DueDateField value={draft.dueAt} onChange={(dueAt) => update({ dueAt })} />
          <ColorPicker
            color={draft.color}
            textColor={draft.textColor}
            onColor={(color) => update({ color, textColor: defaultTextColor(color) })}
            onTextColor={(textColor) => update({ textColor })}
          />
          <IconPicker value={draft.icon} onChange={(icon) => update({ icon })} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="safe-bottom on-note-line flex shrink-0 items-center gap-2 border-t px-4 pt-3 md:px-6 md:pb-5">
        <button
          type="button"
          className="toggle-btn on-note-soft"
          aria-pressed={draft.pinned}
          aria-label="Pin note"
          title={draft.pinned ? "Unpin" : "Pin"}
          onClick={() => update({ pinned: !draft.pinned })}
        >
          <Pin size={19} strokeWidth={2} className={draft.pinned ? "rotate-45" : ""} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="toggle-btn on-note-soft"
          aria-pressed={draft.done}
          aria-label="Mark as done"
          title={draft.done ? "Mark as not done" : "Mark as done"}
          onClick={() => update({ done: !draft.done })}
        >
          <Check size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <span className="on-note-line on-note-muted min-w-0 truncate rounded-full border px-3 py-1.5 text-[12px] font-medium">
          {persisted ? formatEdited(savedAt) : "New note"}
        </span>
        <button
          type="button"
          onClick={() => {
            commit();
            onClose();
          }}
          className="pill on-note-pill pill-lg ml-auto"
        >
          Done
        </button>
      </div>
    </div>
  );
}
