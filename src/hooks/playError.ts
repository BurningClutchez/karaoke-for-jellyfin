import { isAutoplayBlocked } from "@/lib/audioUnlock";
import { reportClientError } from "@/lib/clientLog";

/**
 * A rejected play(). Blocked autoplay is left to the TV's "turn on sound"
 * prompt; an AbortError just means a new song replaced this one. Anything
 * else is shown on the TV and sent to the server log.
 */
export function handlePlayError(
  err: unknown,
  title: string | undefined,
  setError: React.Dispatch<React.SetStateAction<string | null>>
): void {
  if (isAutoplayBlocked(err)) return;
  const { name, message } = (err || {}) as { name?: string; message?: string };
  console.error("Play failed:", err);
  if (name === "AbortError") return;
  reportClientError(
    "error",
    `Couldn't play "${title || "a song"}": ${name || "Error"}: ${message || err}`
  );
  setError(`Play failed: ${message || err}`);
}
