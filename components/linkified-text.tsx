import { shortLinkLabel, splitTextWithLinks } from "@/lib/links";

/** Renders text with every URL turned into a real link that opens in a new tab. */
export function LinkifiedText({ text, linkClassName = "" }: { text: string; linkClassName?: string }) {
  const parts = splitTextWithLinks(text);
  return (
    <>
      {parts.map((part, index) =>
        part.type === "link" ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            title={part.href}
            className={linkClassName}
          >
            {shortLinkLabel(part.href)}
          </a>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}
