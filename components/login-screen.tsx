"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Eye, EyeOff } from "lucide-react";
import { safeNextPath } from "@/lib/links";
import { ONBOARDING_STORAGE_KEY } from "@/lib/brand";
import { AppLogo } from "./app-logo";
import { AnyDeviceArt, HomeScreenArt, SaveLinksArt } from "./illustrations";

const SLIDES = [
  {
    title: "Save links in seconds",
    text: "Share a link from Instagram or any app, or paste it, and it lands here as a sticky note.",
    Art: SaveLinksArt,
  },
  {
    title: "Open them on any device",
    text: "Your notes sync between your phone and laptop, and still open when you're offline.",
    Art: AnyDeviceArt,
  },
  {
    title: "Add it to your home screen",
    text: "Install the app so your notes are always one tap away.",
    Art: HomeScreenArt,
  },
];

/**
 * Onboarding (once per device) followed by the passcode form. Which one shows first is decided
 * before paint by an inline script in app/login/page.tsx that sets <html data-onboarded>.
 */
export function LoginScreen({ next }: { next: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Fallback for client-side navigation, where the page's inline script does not run.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        document.documentElement.setAttribute("data-onboarded", "");
      }
    } catch {
      // Storage blocked: onboarding simply shows again.
    }
  }, []);

  const finishOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    document.documentElement.setAttribute("data-onboarded", "");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <>
      <div className="onboarding-stage">
        <Onboarding onFinish={finishOnboarding} />
      </div>
      <div className="login-stage">
        <PasscodeForm next={next} inputRef={inputRef} />
      </div>
    </>
  );
}

function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef<number | null>(null);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Art = slide.Art;

  const go = (target: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, target)));

  return (
    <main
      className="safe-x mx-auto flex min-h-dvh w-full max-w-md flex-col pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]"
      onPointerDown={(event) => {
        swipeStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (start === null) return;
        const distance = event.clientX - start;
        if (distance < -50) go(index + 1);
        else if (distance > 50) go(index - 1);
      }}
    >
      <section
        aria-roledescription="carousel"
        aria-label="Welcome to My Sticky Notes"
        className="flex flex-1 flex-col items-center justify-center text-center"
      >
        <div aria-live="polite" className="w-full">
          <div key={index} className="fade-up flex flex-col items-center">
            <Art className="h-auto w-full max-w-[300px]" />
            <h1 className="mt-8 text-[24px] font-semibold leading-tight tracking-tight">{slide.title}</h1>
            <p className="mt-2 max-w-[20rem] text-[15px] leading-relaxed text-muted">{slide.text}</p>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-2" role="group" aria-label="Slides">
          {SLIDES.map((item, dot) => (
            <button
              key={item.title}
              type="button"
              onClick={() => go(dot)}
              className="hit flex size-6 items-center justify-center rounded-full"
              aria-label={`Slide ${dot + 1} of ${SLIDES.length}`}
              aria-current={dot === index ? "step" : undefined}
            >
              <span
                className={`block size-2 rounded-full transition-colors duration-200 ${
                  dot === index ? "bg-accent" : "bg-[#D6D5D0]"
                }`}
              />
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => (isLast ? onFinish() : go(index + 1))}
        className="mt-8 h-12 w-full shrink-0 rounded-[10px] bg-accent text-[16px] font-semibold text-ink transition-transform duration-150 active:scale-[0.99]"
      >
        {isLast ? "Enter" : "Next"}
      </button>
    </main>
  );
}

function PasscodeForm({ next, inputRef }: { next: string; inputRef: RefObject<HTMLInputElement | null> }) {
  const [passcode, setPasscode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const submit = async () => {
    if (busy) return;
    if (passcode.trim() === "") {
      setError("Enter your passcode.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let message = "Something went wrong. Try again.";
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok) {
        window.location.replace(safeNextPath(next));
        return;
      }
      if (response.status === 401) message = "That passcode didn't work. Try again.";
      else if (response.status === 429) message = "Too many tries. Wait 15 minutes, then try again.";
      else if (response.status === 503) message = "The app isn't set up yet. Reload the page to see what's missing.";
    } catch {
      message = "Can't reach the server. Check your connection and try again.";
    }
    setBusy(false);
    setError(message);
    inputRef.current?.select();
  };

  return (
    <main className="safe-x mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center py-12">
      <AppLogo size={64} />
      <h1 className="mt-6 text-[32px] font-normal leading-[1.1] tracking-[-0.03em]">My Sticky Notes</h1>
      <p className="mt-2 text-[15px] text-muted">Enter your passcode to open your notes.</p>

      <form
        className="mt-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="passcode" className="text-[13px] font-medium">
          Passcode
        </label>
        <div className="relative mt-2">
          <input
            ref={inputRef}
            id="passcode"
            name="passcode"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            autoFocus
            value={passcode}
            onChange={(event) => {
              setPasscode(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-12 w-full rounded-2xl border border-line bg-surface pl-4 pr-12 text-[16px] text-ink"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted"
            aria-label="Show passcode"
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
        <p id={errorId} role="alert" className="mt-2 min-h-5 text-[14px] leading-5 text-danger">
          {error ?? ""}
        </p>
        <button type="submit" aria-disabled={busy} className="pill pill-black pill-lg mt-4 w-full">
          {busy ? (
            <span
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
          ) : null}
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
