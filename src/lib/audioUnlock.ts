// Browsers refuse to play sound on a page nobody has pressed a key on or
// tapped yet (autoplay policy). playMedia() remembers media the browser
// refused, the TV shows a prompt while there are any, and unlockAudio() starts
// them again from inside the key press or tap.
import { reportClientError } from "./clientLog";

type Listener = () => void;

const blocked = new Set<HTMLMediaElement>();
const listeners = new Set<Listener>();
let reported = false;

function notify() {
  listeners.forEach(listener => listener());
}

/** True for the error play() rejects with when autoplay isn't allowed */
export function isAutoplayBlocked(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "NotAllowedError";
}

export function isAudioBlocked(): boolean {
  return blocked.size > 0;
}

export function subscribeAudioBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function markPlaying(media: HTMLMediaElement) {
  if (blocked.delete(media)) notify();
}

function markBlocked(media: HTMLMediaElement) {
  if (!reported) {
    reported = true;
    reportClientError(
      "warn",
      "The browser blocked sound (autoplay); waiting for someone to press OK or tap the TV"
    );
  }
  if (!blocked.has(media)) {
    blocked.add(media);
    notify();
  }
}

/**
 * media.play(), remembering media the browser refused so a key press or tap
 * can start it. Other errors are passed on to the caller.
 */
export function playMedia(media: HTMLMediaElement): Promise<void> {
  let result: Promise<void> | undefined;
  try {
    result = media.play();
  } catch (error) {
    result = Promise.reject(error);
  }
  return Promise.resolve(result).then(
    () => markPlaying(media),
    error => {
      if (isAutoplayBlocked(error)) markBlocked(media);
      throw error;
    }
  );
}

/** Start the refused media; call it from a key press or tap handler */
export function unlockAudio(): void {
  [...blocked].forEach(media => {
    playMedia(media).catch(() => {
      // Still refused (or another error): the prompt stays up
    });
  });
}

/** Test hook */
export function resetAudioUnlock(): void {
  blocked.clear();
  listeners.clear();
  reported = false;
}
