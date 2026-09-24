import { Socket } from "socket.io-client";
import { Dispatch, SetStateAction } from "react";

export const NOTICE_MS = 8000;

// Joining can briefly race the server; these resolve themselves
const QUIET_CODES = new Set(["NOT_IN_SESSION"]);

/**
 * Shows server messages in the existing banner for a few seconds: "notice"
 * events (e.g. a song that couldn't play was skipped) and socket "error"
 * events, which were otherwise only seen while adding a song.
 */
export function setupNoticeHandlers(
  socket: Socket,
  setError: Dispatch<SetStateAction<string | null>>
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (message: string) => {
    setError(message);
    clearTimeout(timer);
    timer = setTimeout(
      () => setError(current => (current === message ? null : current)),
      NOTICE_MS
    );
  };

  socket.on("notice", (notice: { message?: string }) => {
    if (notice?.message) show(notice.message);
  });
  socket.on("error", (error: { code?: string; message?: string }) => {
    if (error?.message && !QUIET_CODES.has(error.code || "")) {
      show(error.message);
    }
  });
}
