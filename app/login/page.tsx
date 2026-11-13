import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMissingConfig, isAuthenticated } from "@/lib/auth";
import { safeNextPath } from "@/lib/links";
import { ONBOARDING_STORAGE_KEY } from "@/lib/brand";
import { LoginScreen } from "@/components/login-screen";
import { SetupScreen } from "@/components/setup-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unlock",
};

// Runs before the page paints, so a returning device never sees the onboarding flash.
const ONBOARDING_SCRIPT = `try{if(window.localStorage.getItem(${JSON.stringify(
  ONBOARDING_STORAGE_KEY,
)}))document.documentElement.setAttribute("data-onboarded","")}catch(e){}`;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const missing = getMissingConfig();
  if (missing.length > 0) return <SetupScreen missing={missing} />;

  const params = await searchParams;
  const nextParam = params.next;
  const next = safeNextPath(typeof nextParam === "string" ? nextParam : null);

  if (await isAuthenticated()) redirect(next);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONBOARDING_SCRIPT }} />
      <LoginScreen next={next} />
    </>
  );
}
