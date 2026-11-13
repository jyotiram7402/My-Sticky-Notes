"use client";

import type { CSSProperties } from "react";
import { Folder, Pin, Plus } from "lucide-react";
import { type Note, DONE_COLORS, NOTE_COLOR_HEX, TEXT_COLOR_HEX } from "@/lib/notes";
import { faviconUrl, linkDomain, noteLinks, shortLinkLabel, stripLinks } from "@/lib/links";
import { formatClock, formatDayLabel } from "@/lib/format";
import { NOTE_ICON_COMPONENTS } from "./note-icons";
import { LinkifiedText } from "./linkified-text";

/** Title and preview for a card. Untitled notes borrow their first line of words, or their link. */
function cardText(note: Note, links: string[]): { title: string; preview: string } {
  const title = note.title.trim();
  const content = note.content.trim();
  if (title) return { title, preview: content };

  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const words = stripLinks(lines[index]);
    if (words) return { title: words, preview: lines.slice(index + 1).join("\n").trim() };
  }
  // Only links: show the first one as the title and skip a preview that would repeat it.
  if (links.length > 0) return { title: shortLinkLabel(links[0], 60), preview: links.length > 1 ? content : "" };
  return { title: "Untitled", preview: "" };
}

interface NoteCardProps {
  note: Note;
  now: number;
  onOpen: (note: Note) => void;
}

export function NoteCard({ note, now, onOpen }: NoteCardProps) {
  const links = noteLinks(note);
  const firstLink = links.length > 0 ? links[0] : null;
  const domain = firstLink ? linkDomain(firstLink) : null;
  const { title, preview } = cardText(note, links);

  const background = note.done ? DONE_COLORS.background : NOTE_COLOR_HEX[note.color];
  const foreground = note.done ? DONE_COLORS.text : TEXT_COLOR_HEX[note.textColor];
  const shownDate = new Date(note.dueAt ?? note.updatedAt);
  const dayLabel = formatDayLabel(shownDate, new Date(now));
  const timeLabel = note.dueAt ? formatClock(shownDate) : null;
  const Icon = note.icon ? NOTE_ICON_COMPONENTS[note.icon] : null;
  const struck = note.done ? " line-through" : "";
  const outlined = note.color === "white" && !note.done;

  return (
    <div className="note-wrap">
      <article
        className={`note-card${outlined ? " note-card--outlined" : ""}`}
        style={{ "--note-bg": background, color: foreground } as CSSProperties}
      >
        <button
          type="button"
          className="note-card__open"
          onClick={() => onOpen(note)}
          aria-label={`Open note: ${title}`}
        />
        <div className="note-card__body">
          <div className="flex items-start gap-2">
            <p className={`min-w-0 flex-1 truncate text-[12px] font-bold leading-4 tabular-nums${struck}`}>
              {dayLabel}
              {timeLabel ? <span className="ml-1.5">{timeLabel}</span> : null}
            </p>
            {note.pinned ? (
              <>
                <Pin size={14} strokeWidth={2.25} className="mt-px shrink-0 rotate-45" aria-hidden="true" />
                <span className="sr-only">Pinned</span>
              </>
            ) : null}
          </div>

          <h3
            className={`wrap-any mt-1.5 line-clamp-2 text-[17px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[18px]${struck}`}
          >
            <LinkifiedText text={title} linkClassName="underline decoration-1 underline-offset-2" />
          </h3>

          {firstLink && domain ? (
            <a
              href={firstLink}
              target="_blank"
              rel="noopener noreferrer"
              title={firstLink}
              aria-label={`Open link: ${domain}`}
              className="hit mt-1.5 flex min-w-0 max-w-full items-center gap-1.5 self-start text-[11px] font-semibold leading-4"
            >
              <img
                src={faviconUrl(domain)}
                alt=""
                width={14}
                height={14}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="size-3.5 shrink-0 rounded-[3px] bg-white"
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
              <span className="truncate underline decoration-1 underline-offset-2">{domain}</span>
            </a>
          ) : note.folder ? (
            <p className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-4 opacity-80">
              <Folder size={12} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{note.folder}</span>
            </p>
          ) : null}

          {preview ? (
            <p
              className={`wrap-any mt-1.5 line-clamp-3 whitespace-pre-line text-[12.5px] leading-[1.4] opacity-90 sm:line-clamp-4${struck}`}
            >
              <LinkifiedText text={preview} linkClassName="underline decoration-1 underline-offset-2" />
            </p>
          ) : null}

          <div className="mt-auto flex items-end pt-2">
            {Icon ? <Icon size={18} strokeWidth={2} aria-hidden="true" /> : null}
          </div>
        </div>
        <span className="note-fold" aria-hidden="true" />
      </article>
    </div>
  );
}

/** The orange "+" card: same size and fold as a note. */
export function AddNoteCard({ onClick }: { onClick: () => void }) {
  return (
    <div className="note-wrap">
      <div className="note-card" style={{ "--note-bg": "#FF9A3C" } as CSSProperties}>
        <button
          type="button"
          onClick={onClick}
          className="note-card__open flex items-center justify-center text-white"
          aria-label="New note"
        >
          <Plus size={44} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <span className="note-fold" aria-hidden="true" />
      </div>
    </div>
  );
}

export function NoteSkeleton() {
  return <div className="note-skeleton animate-pulse" aria-hidden="true" />;
}
