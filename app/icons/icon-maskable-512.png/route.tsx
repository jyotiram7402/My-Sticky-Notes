import { renderAppIcon } from "@/lib/app-icon";

// Serves /icons/icon-maskable-512.png. Full-bleed orange so Android can crop it to any shape;
// the note stays inside the maskable safe zone.
export const dynamic = "force-static";

export function GET() {
  return renderAppIcon(512, "square");
}
