"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import type { SyncStatus } from "@/lib/store";

const LABELS: Record<SyncStatus, string> = {
  synced: "All changes synced",
  syncing: "Syncing",
  offline: "Offline. Changes are saved on this device",
  error: "Sync problem. Changes are saved on this device",
};

/** Round sync-status button in the top bar. Tapping it syncs right away. */
export function SyncButton({ status, onSync }: { status: SyncStatus; onSync: () => void }) {
  // Only show the spinner for syncs that take a moment, so quick saves don't flicker.
  const [shown, setShown] = useState<SyncStatus>(status);

  useEffect(() => {
    if (status !== "syncing") {
      setShown(status);
      return;
    }
    const timer = window.setTimeout(() => setShown("syncing"), 350);
    return () => window.clearTimeout(timer);
  }, [status]);

  const label = LABELS[shown];
  const tone = shown === "error" ? "text-danger" : shown === "offline" ? "text-muted" : "text-ink";

  return (
    <button
      type="button"
      onClick={onSync}
      className={`icon-btn ${tone}`}
      aria-label={`${label}. Sync now`}
      title={label}
    >
      {shown === "synced" ? <CloudCheck size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
      {shown === "syncing" ? (
        <RefreshCw size={18} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
      ) : null}
      {shown === "offline" ? <CloudOff size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
      {shown === "error" ? <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}
