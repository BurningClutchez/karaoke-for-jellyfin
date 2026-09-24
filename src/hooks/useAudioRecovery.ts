"use client";

import { RefObject, useEffect, useRef } from "react";
import { reportClientError } from "@/lib/clientLog";

export const STALL_TIMEOUT_MS = 15000;

/** Plain-language reason for an <audio> error */
export function describeMediaError(error: MediaError | null): string {
  switch (error?.code) {
    case 1:
      return "playback was aborted";
    case 2:
      return "network error";
    case 3:
      return "the audio couldn't be decoded";
    case 4:
      return "the audio format isn't supported";
    default:
      return "unknown playback error";
  }
}

/**
 * Keeps a song going: on an error, or 15 s stuck loading while playing, it
 * reloads the audio once from where it stopped. If that fails too it calls
 * onGiveUp (the TV reports the song and skips it).
 */
export function useAudioRecovery(
  audioRef: RefObject<HTMLAudioElement | null>,
  songId: string | undefined,
  onGiveUp?: (reason: string) => void
): void {
  const giveUpRef = useRef(onGiveUp);
  giveUpRef.current = onGiveUp;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !songId) return;
    let retried = false;
    let gaveUp = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const giveUp = (reason: string) => {
      if (gaveUp) return;
      gaveUp = true;
      reportClientError("error", `Song ${songId} failed: ${reason}`);
      giveUpRef.current?.(reason);
    };
    const retry = (reason: string) => {
      if (retried) return giveUp(reason);
      retried = true;
      const position = audio.currentTime;
      reportClientError(
        "warn",
        `Song ${songId}: ${reason}; retrying at ${Math.round(position)}s`
      );
      const resume = () => {
        audio.currentTime = position;
        audio.play().catch(() => {});
      };
      audio.addEventListener("loadedmetadata", resume, { once: true });
      audio.load();
    };

    const onError = () => retry(describeMediaError(audio.error));
    const clearStall = () => clearTimeout(stallTimer);
    const onStall = () => {
      clearStall();
      if (audio.paused) return;
      stallTimer = setTimeout(
        () => retry("the audio stopped loading"),
        STALL_TIMEOUT_MS
      );
    };

    const listeners: [string, () => void][] = [
      ["error", onError],
      ["stalled", onStall],
      ["waiting", onStall],
      ["timeupdate", clearStall],
      ["playing", clearStall],
      ["pause", clearStall],
    ];
    listeners.forEach(([event, handler]) =>
      audio.addEventListener(event, handler)
    );
    return () => {
      clearStall();
      listeners.forEach(([event, handler]) =>
        audio.removeEventListener(event, handler)
      );
    };
  }, [audioRef, songId]);
}
