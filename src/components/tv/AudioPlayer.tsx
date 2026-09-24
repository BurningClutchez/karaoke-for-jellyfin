"use client";

import { RefObject, useCallback } from "react";
import { QueueItem, PlaybackState, PlaybackCommand } from "@/types";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useAudioRecovery } from "@/hooks/useAudioRecovery";

interface AudioPlayerProps {
  song: QueueItem | null;
  playbackState: PlaybackState | null;
  onPlaybackControl: (command: PlaybackCommand) => void;
  onSongEnded: () => void;
  onTimeUpdate: (currentTime: number) => void;
  /** Receives the audio element so other views (CDG graphics) can follow its clock */
  mediaRef?: RefObject<HTMLMediaElement | null>;
  /** Called when a song can't be played even after a retry */
  onPlaybackFailed?: (reason: string) => void;
}

export function AudioPlayer({
  song,
  playbackState,
  onSongEnded,
  onTimeUpdate,
  mediaRef,
  onPlaybackFailed,
}: AudioPlayerProps) {
  const { audioRef, error } = useAudioPlayer({
    song,
    playbackState,
    onSongEnded,
    onTimeUpdate,
  });

  useAudioRecovery(audioRef, song?.id, onPlaybackFailed);

  const setAudioElement = useCallback(
    (element: HTMLAudioElement | null) => {
      audioRef.current = element;
      if (mediaRef) mediaRef.current = element;
    },
    [audioRef, mediaRef]
  );

  return (
    <>
      <audio
        ref={setAudioElement}
        data-testid="audio-player"
        aria-label="Karaoke audio player"
        preload="auto"
        style={{ display: "none" }}
      />

      {error && (
        <div
          data-testid="audio-error"
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-900 border border-red-700 rounded-lg p-4 text-red-300"
        >
          Audio Error: {error}
        </div>
      )}
    </>
  );
}
