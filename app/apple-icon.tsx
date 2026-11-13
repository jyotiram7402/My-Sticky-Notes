import { renderAppIcon } from "@/lib/app-icon";

// iPhone/iPad home screen icon. Full-bleed square: iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(size.width, "square");
}
