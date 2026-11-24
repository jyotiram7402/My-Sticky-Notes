"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconUrl } from "@/lib/links";

/** A link's site icon, loaded from the site itself. Shows a globe when the site has none. */
export function Favicon({ href, size, className = "" }: { href: string; size: number; className?: string }) {
  const src = faviconUrl(href);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src === null || failedSrc === src) {
    return <Globe size={size} strokeWidth={2} className="shrink-0" aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
