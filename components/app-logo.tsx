import { LOGO } from "@/lib/brand";

/** The app icon as inline SVG: an orange rounded square with a white folded sticky note. */
export function AppLogo({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={LOGO.viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="512" height="512" rx={LOGO.radius} fill={LOGO.orange} />
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
  );
}
