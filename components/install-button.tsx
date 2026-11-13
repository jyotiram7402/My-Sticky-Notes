"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Sheet } from "./sheet";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __msnInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type Mode = "hidden" | "prompt" | "ios";

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** iPhone/iPad Safari, where installing means Share → Add to Home Screen. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\//i.test(ua);
  return isIos && !otherBrowser && /Safari/i.test(ua);
}

/**
 * "Install app" pill. Chrome/Edge/Android: the native install prompt (beforeinstallprompt).
 * iPhone/iPad Safari: a small sheet with instructions. Hidden when installed or not installable.
 */
export function InstallButton() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onInstallable = () => setMode("prompt");
    const onInstalled = () => {
      window.__msnInstallPrompt = null;
      setMode("hidden");
    };
    window.addEventListener("msn:installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);

    if (window.__msnInstallPrompt) setMode("prompt");
    else if (isIosSafari()) setMode("ios");

    return () => {
      window.removeEventListener("msn:installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (mode === "ios") {
      setSheetMounted(true);
      setSheetOpen(true);
      return;
    }
    const promptEvent = window.__msnInstallPrompt;
    if (!promptEvent) {
      setMode("hidden");
      return;
    }
    // A prompt event can only be used once. Chrome fires a new one if the app is still installable.
    window.__msnInstallPrompt = null;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // The browser refused to show the prompt.
    }
    setMode("hidden");
  };

  if (mode === "hidden") return null;

  return (
    <>
      <button type="button" onClick={() => void install()} className="pill pill-outline hit text-ink">
        <Download size={15} strokeWidth={2} aria-hidden="true" />
        Install app
      </button>

      {sheetMounted ? (
        <Sheet
          open={sheetOpen}
          onRequestClose={() => setSheetOpen(false)}
          onExited={() => setSheetMounted(false)}
          label="Install on iPhone or iPad"
          variant="compact"
          className="text-ink"
        >
          <div data-drag-zone className="touch-none px-6 pt-3">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line md:hidden" aria-hidden="true" />
            <h2 className="text-[20px] font-semibold tracking-tight">Add to Home Screen</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Tap the Share button, then Add to Home Screen.
            </p>
          </div>
          <ol className="mt-4 space-y-3 px-6 text-[15px]">
            <li className="flex items-center gap-3">
              <span className="icon-btn" aria-hidden="true">
                <Share size={19} strokeWidth={1.75} />
              </span>
              <span>
                Tap <strong className="font-semibold">Share</strong> in Safari&apos;s toolbar
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="icon-btn" aria-hidden="true">
                <SquarePlus size={19} strokeWidth={1.75} />
              </span>
              <span>
                Choose <strong className="font-semibold">Add to Home Screen</strong>
              </span>
            </li>
          </ol>
          <div className="safe-bottom px-6 pt-6">
            <button
              type="button"
              data-autofocus
              onClick={() => setSheetOpen(false)}
              className="pill pill-black pill-lg w-full"
            >
              Got it
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
