import { renderAppIcon } from "@/lib/app-icon";

// Serves /icons/icon-192.png for the web app manifest. Generated once at build time.
export const dynamic = "force-static";

export function GET() {
  return renderAppIcon(192, "rounded");
}
