import { redirect } from "next/navigation";
import { getMissingConfig, isAuthenticated } from "@/lib/auth";
import { NotesApp } from "@/components/notes-app";
import { SetupScreen } from "@/components/setup-screen";

// Always rendered at request time: it reads env vars and the session cookie.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const missing = getMissingConfig();
  if (missing.length > 0) return <SetupScreen missing={missing} />;
  if (!(await isAuthenticated())) redirect("/login");
  return <NotesApp />;
}
