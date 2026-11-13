"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Plus, X } from "lucide-react";
import { extractLinks, faviconUrl, linkDomain, normalizeLinkInput } from "@/lib/links";
import { copyText, readClipboardText } from "@/lib/clipboard";

interface LinksRowProps {
  links: string[];
  /** Adds a link to the note. Returns false when it could not be added. */
  onAdd: (href: string) => boolean;
}

/** "Links" row: one chip per link (open and copy) plus an orange "+" tile that pastes a link. */
export function LinksRow({ links, onAdd }: LinksRowProps) {
  const [manual, setManual] = useState(false);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const pasteFromClipboard = async () => {
    setMessage(null);
    const text = await readClipboardText();
    if (text === null) {
      setManual(true);
      return;
    }
    const href = extractLinks(text)[0] ?? normalizeLinkInput(text);
    if (!href) {
      setManual(true);
      setMessage("No link on the clipboard. Paste one here.");
      return;
    }
    if (onAdd(href)) {
      setManual(false);
    }
  };

  const submitManual = () => {
    const href = normalizeLinkInput(value);
    if (!href) {
      setMessage("That doesn't look like a link.");
      return;
    }
    if (onAdd(href)) {
      setValue("");
      setMessage(null);
      setManual(false);
    }
  };

  const copyLink = async (href: string) => {
    if (await copyText(href)) {
      setCopied(href);
      window.setTimeout(() => setCopied((current) => (current === href ? null : current)), 1500);
    }
  };

  return (
    <section aria-labelledby="links-label">
      <h3 id="links-label" className="field-label">
        Links
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        <li>
          <button
            type="button"
            className="paste-tile"
            aria-label="Paste a link from the clipboard"
            title="Paste a link"
            onClick={() => void pasteFromClipboard()}
          >
            <Plus size={22} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </li>
        {links.map((href) => {
          const domain = linkDomain(href);
          return (
            <li key={href} className="min-w-0 max-w-full">
              <div className="link-chip">
                <img
                  src={faviconUrl(domain)}
                  alt=""
                  width={18}
                  height={18}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="size-[18px] shrink-0 rounded-[4px]"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
                <span className="ml-1.5 min-w-0 max-w-[11rem] truncate text-[14px] font-medium" title={href}>
                  {domain}
                </span>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-chip__btn ml-1"
                  aria-label={`Open ${domain}`}
                  title="Open link"
                >
                  <ExternalLink size={17} strokeWidth={2} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className="link-chip__btn"
                  aria-label={copied === href ? `Copied ${domain} link` : `Copy ${domain} link`}
                  title="Copy link"
                  onClick={() => void copyLink(href)}
                >
                  {copied === href ? (
                    <Check size={17} strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <Copy size={17} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {manual ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitManual();
          }}
        >
          <input
            autoFocus
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a link"
            aria-label="Link to add"
            className="text-field"
          />
          <button type="submit" className="pill on-note-pill h-11 px-4" disabled={value.trim() === ""}>
            Add
          </button>
          <button
            type="button"
            className="link-chip__btn on-note-soft rounded-full"
            style={{ color: "inherit" }}
            aria-label="Cancel"
            onClick={() => {
              setManual(false);
              setValue("");
              setMessage(null);
            }}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </form>
      ) : null}
      {message ? (
        <p className="on-note-muted mt-1.5 text-[13px]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
