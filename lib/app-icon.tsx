// SERVER ONLY. Draws the app icon as a PNG with ImageResponse (no image tools needed).

import { ImageResponse } from "next/og";
import { LOGO } from "./brand";

export type IconShape = "rounded" | "square";

/**
 * "rounded": orange rounded square on a transparent background (favicon, manifest "any" icons).
 * "square": orange fills the whole canvas (apple-touch-icon and the maskable icon, which the OS crops).
 */
export function renderAppIcon(size: number, shape: IconShape): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <svg width={size} height={size} viewBox={LOGO.viewBox} xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="512" height="512" rx={shape === "rounded" ? LOGO.radius : 0} fill={LOGO.orange} />
          <path d={LOGO.notePath} fill={LOGO.noteColor} />
          <path d={LOGO.foldPath} fill={LOGO.foldColor} />
          {LOGO.lines.map((line) => (
            <rect
              key={line.y}
              x={line.x}
              y={line.y}
              width={line.width}
              height={line.height}
              rx={line.height / 2}
              fill={LOGO.lineColor}
            />
          ))}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
