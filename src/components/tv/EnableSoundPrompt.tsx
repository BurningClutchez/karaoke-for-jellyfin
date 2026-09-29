"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  isAudioBlocked,
  subscribeAudioBlocked,
  unlockAudio,
} from "@/lib/audioUnlock";

// Key presses and taps count as the interaction browsers want before sound
const UNLOCK_EVENTS = ["keydown", "pointerdown", "touchend"] as const;

/** Shown while the browser blocks sound; any key press or tap starts it */
export function EnableSoundPrompt() {
  const blocked = useSyncExternalStore(
    subscribeAudioBlocked,
    isAudioBlocked,
    () => false
  );

  useEffect(() => {
    if (!blocked) return;
    const unlock = (event: Event) => {
      unlockAudio();
      // The key that turns sound on shouldn't also pause (Space) or skip (S)
      if (event.type === "keydown") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    UNLOCK_EVENTS.forEach(event =>
      window.addEventListener(event, unlock, true)
    );
    return () =>
      UNLOCK_EVENTS.forEach(event =>
        window.removeEventListener(event, unlock, true)
      );
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div
      data-testid="enable-sound-prompt"
      role="alert"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 cursor-pointer"
      onClick={unlockAudio}
    >
      <div className="text-center bg-gray-900 border border-purple-500 rounded-2xl px-10 py-8 shadow-2xl">
        <div className="text-6xl mb-4" aria-hidden="true">
          🔇
        </div>
        <p className="text-3xl font-semibold text-white mb-2">
          Press OK or tap the screen to turn on sound
        </p>
        <p className="text-lg text-gray-400">
          This browser won&apos;t play sound until someone interacts with it
        </p>
      </div>
    </div>
  );
}
