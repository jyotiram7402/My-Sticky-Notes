import { renderAppIcon } from "@/lib/app-icon";

// Browser tab icon, generated as a PNG at build time.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return renderAppIcon(size.width, "rounded");
}
