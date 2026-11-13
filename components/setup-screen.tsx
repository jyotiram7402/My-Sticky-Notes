"use client";

// Rendered by server pages. Marked as a client component because lucide v1 icons read a React
// context; the only prop is a plain string array.
import { CircleAlert } from "lucide-react";
import { AppLogo } from "./app-logo";

const SETTINGS: Record<string, string> = {
  APP_PASSCODE: "The passcode you'll type to unlock the app on each device.",
  SESSION_SECRET: "A long random string (32+ characters) that signs the login cookie.",
  DATABASE_URL:
    "Your Supabase database. Connect a free Supabase database from Vercel's Storage tab (it adds POSTGRES_URL for you), or paste Supabase's Transaction pooler connection string (port 6543) as DATABASE_URL.",
};

/** Friendly screen shown instead of the app while required settings are missing. */
export function SetupScreen({ missing }: { missing: string[] }) {
  return (
    <main className="safe-x mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center py-12">
      <AppLogo size={56} />
      <h1 className="mt-6 text-[28px] font-normal leading-tight tracking-tight">Almost ready</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        My Sticky Notes needs a few settings before it can open. Add these in Vercel → Settings → Environment
        Variables:
      </p>

      <ul className="mt-5 space-y-3">
        {missing.map((key) => (
          <li key={key} className="rounded-2xl border border-line bg-surface p-4">
            <p className="flex items-center gap-2 font-mono text-[14px] font-semibold">
              <CircleAlert size={16} strokeWidth={2.25} className="shrink-0 text-accent" aria-hidden="true" />
              {key}
            </p>
            {SETTINGS[key] ? <p className="mt-1 text-[14px] leading-relaxed text-muted">{SETTINGS[key]}</p> : null}
          </li>
        ))}
      </ul>

      <ol className="mt-6 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
        <li>Open your project on vercel.com, then Settings → Environment Variables.</li>
        <li>Add each missing value and save.</li>
        <li>Redeploy: Deployments → latest deployment → ⋯ → Redeploy.</li>
      </ol>

      <p className="mt-6 text-[13px] text-muted">This page goes away once everything is set.</p>
    </main>
  );
}
