"use client";

import type { RefObject } from "react";
import type { QueueItem, PlaybackState } from "@/types";
import type { CdgMode } from "@/lib/config";
import { useCdgSource } from "@/hooks/useCdgSource";
import { LyricsDisplay } from "@/components/tv/LyricsDisplay";
import { CdgDisplay } from "@/components/tv/CdgDisplay";

interface SongDisplayProps {
  song: QueueItem;
  playbackState: PlaybackState | null;
  isConnected: boolean;
  cdgMode: CdgMode;
  audioRef?: RefObject<HTMLMediaElement | null>;
}

/** Shows CD+G graphics when the song has them, otherwise synced lyrics */
export function SongDisplay({
  song,
  playbackState,
  isConnected,
  cdgMode,
  audioRef,
}: SongDisplayProps) {
  const { source, problem, fallBack } = useCdgSource(
    audioRef ? song.mediaItem.jellyfinId : undefined,
    cdgMode
  );

  if (audioRef && (source.kind === "canvas" || source.kind === "video")) {
    return (
      <CdgDisplay
        song={song}
        source={source}
        audioRef={audioRef}
        onFailed={fallBack}
      />
    );
  }

  return (
    <>
      <LyricsDisplay
        song={song}
        playbackState={playbackState}
        isConnected={isConnected}
      />
      {problem && (
        <div
          data-testid="cdg-unavailable"
          title={problem}
          className="absolute bottom-20 right-4 z-30 px-3 py-1 rounded-full text-xs bg-yellow-900/80 text-yellow-200"
        >
          Karaoke graphics unavailable
        </div>
      )}
    </>
  );
}
