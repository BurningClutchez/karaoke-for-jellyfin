"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

export const TV_RETRY_DELAY_MS = 5000;
const MAX_RESETS = 3;
let resets = 0;

/** Test hook */
export function resetTvRecovery() {
  resets = 0;
}

/**
 * The TV is unattended, so it recovers by itself: it re-renders after a few
 * seconds, and reloads the page if that keeps failing.
 */
export default function TVError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      resets += 1;
      if (resets > MAX_RESETS) {
        resets = 0;
        window.location.reload();
      } else {
        reset();
      }
    }, TV_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reset]);

  return (
    <ErrorScreen
      error={error}
      title="Recovering…"
      detail="The TV display hit a problem and will restart in a few seconds."
      actionLabel="Restart now"
      onAction={() => window.location.reload()}
    />
  );
}
