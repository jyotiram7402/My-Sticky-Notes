// Link detection and helpers, share-target parsing and safe redirect paths.
// Pure code with no browser or server dependencies, so both client and server import it.

import { LIMITS } from "./notes";

// http(s):// or www. followed by anything that is not whitespace, quotes or angle brackets.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "'", '"', "*"]);
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function countChar(value: string, char: string): number {
  let count = 0;
  for (const c of value) {
    if (c === char) count += 1;
  }
  return count;
}

/** Drops punctuation that ends a sentence rather than the URL, keeping balanced brackets. */
function trimTrailing(raw: string): string {
  let url = raw;
  while (url.length > 0) {
    const last = url.charAt(url.length - 1);
    if (TRAILING_PUNCTUATION.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opener = CLOSERS[last];
    if (opener !== undefined && countChar(url, opener) < countChar(url, last)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

/** Turns a detected URL into an absolute http(s) href, or null if it is not a usable web link. */
export function toHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname;
  if (!host || (host !== "localhost" && !host.includes("."))) return null;
  return url.href;
}

export interface LinkMatch {
  index: number;
  text: string;
  href: string;
}

export function findLinks(text: string): LinkMatch[] {
  const matches: LinkMatch[] = [];
  if (!text) return matches;
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    const raw = trimTrailing(match[0]);
    const href = raw ? toHref(raw) : null;
    if (href) matches.push({ index: match.index, text: raw, href });
    match = re.exec(text);
  }
  return matches;
}

/** Unique hrefs in the order they appear. */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  for (const found of findLinks(text)) seen.add(found.href);
  return Array.from(seen);
}

/** Unique links from a note's title, then its content. */
export function noteLinks(note: { title: string; content: string }): string[] {
  const seen = new Set<string>();
  for (const href of extractLinks(note.title)) seen.add(href);
  for (const href of extractLinks(note.content)) seen.add(href);
  return Array.from(seen);
}

export function linkDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return href;
  }
}

export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/** "youtube.com/watch" style label for showing a long URL in a small space. */
export function shortLinkLabel(href: string, max = 34): string {
  let label = href;
  try {
    const url = new URL(href);
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the encoded path
    }
    label = url.hostname.replace(/^www\./i, "") + (path === "/" ? "" : path.replace(/\/$/, ""));
  } catch {
    // keep the raw href
  }
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

/** Splits text into plain parts and link parts, for rendering real <a> elements. */
export function splitTextWithLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const found of findLinks(text)) {
    if (found.index > cursor) parts.push({ type: "text", value: text.slice(cursor, found.index) });
    parts.push({ type: "link", value: found.text, href: found.href });
    cursor = found.index + found.text.length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts;
}

/** The text with every link removed, keeping line breaks. */
export function stripLinks(text: string): string {
  let result = "";
  let cursor = 0;
  for (const found of findLinks(text)) {
    result += text.slice(cursor, found.index);
    cursor = found.index + found.text.length;
  }
  result += text.slice(cursor);
  return result
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

/** Accepts "example.com/page", "www.example.com" or a full URL typed or pasted by hand. */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const found = extractLinks(value);
  if (found.length > 0) return found[0];
  if (/\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  return toHref(withScheme);
}

// ---------------------------------------------------------------------------
// Android share target

export interface SharedInput {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

export interface SharedNote {
  title: string;
  content: string;
  links: string[];
}

function cleanShared(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").trim();
}

/**
 * Builds a new note from share-target params. Apps disagree on where the link goes
 * (Instagram puts it inside `text`), so links are collected from all three params.
 */
export function buildSharedNote(input: SharedInput): SharedNote | null {
  const title = cleanShared(input.title).replace(/\s*\n\s*/g, " ");
  const text = cleanShared(input.text);
  const urlParam = cleanShared(input.url);
  const urlHref = urlParam ? (extractLinks(urlParam)[0] ?? normalizeLinkInput(urlParam)) : null;
  const textLinks = extractLinks(text);

  const links: string[] = [];
  const candidates = [...(urlHref ? [urlHref] : []), ...textLinks, ...extractLinks(title)];
  for (const href of candidates) {
    if (!links.includes(href)) links.push(href);
  }

  const titleIsOnlyLink = title !== "" && stripLinks(title) === "";
  const noteTitle = title !== "" && !titleIsOnlyLink && title !== text ? title.slice(0, LIMITS.title) : "";

  const parts: string[] = [];
  if (text) parts.push(text);
  if (urlHref && !textLinks.includes(urlHref)) parts.push(urlHref);
  if (titleIsOnlyLink && !parts.some((part) => part.includes(title))) parts.push(title);
  const content = parts.join("\n").slice(0, LIMITS.content);

  if (!noteTitle && !content) return null;
  return { title: noteTitle, content, links };
}

// ---------------------------------------------------------------------------
// Redirects

/** Only same-site relative paths are allowed as a "next" redirect. Anything else becomes "/". */
export function safeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  const base = "https://placeholder.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return "/";
  }
  if (url.origin !== base) return "/";
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/api/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
