import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMissingConfig, isAuthenticated } from "@/lib/auth";
import { NotesApp } from "@/components/notes-app";
import { SetupScreen } from "@/components/setup-screen";

// Android share target (see public/manifest.webmanifest). The shared title, text and url are read
// on the client by NotesApp, which also works when the service worker serves the cached app offline.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Save link",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SharePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const missing = getMissingConfig();
  if (missing.length > 0) return <SetupScreen missing={missing} />;

  if (!(await isAuthenticated())) {
    // Keep the shared data through the login.
    const params = await searchParams;
    const query = new URLSearchParams();
    for (const key of ["title", "text", "url"]) {
      const value = params[key];
      if (typeof value === "string" && value !== "") query.set(key, value.slice(0, 4000));
    }
    const qs = query.toString();
    redirect(`/login?next=${encodeURIComponent(qs ? `/share?${qs}` : "/share")}`);
  }

  return <NotesApp />;
}
