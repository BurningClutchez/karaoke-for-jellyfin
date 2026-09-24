"use client";

import { useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { QueueItem } from "@/types";

/**
 * When the TV gives up on a song: tell the server (which notifies everyone)
 * and skip to the next song so the party keeps going.
 */
export function usePlaybackFailure(
  socket: Socket | null,
  currentSong: QueueItem | null,
  skipSong: () => void
) {
  return useCallback(
    (reason: string) => {
      socket?.emit("playback-failed", {
        title: currentSong?.mediaItem.title || "A song",
        reason,
      });
      skipSong();
    },
    [socket, currentSong, skipSong]
  );
}
