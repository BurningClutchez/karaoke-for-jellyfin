"use client";

import { RefObject, useRef } from "react";
import type { QueueItem } from "@/types";
import type { CdgSource } from "@/hooks/useCdgSource";
import { useCdgCanvas, useVideoSync } from "@/hooks/useCdgPlayback";
import { CDG_HEIGHT, CDG_WIDTH } from "@/lib/cdg/instructions";

type MediaRef = RefObject<HTMLMediaElement | null>;

// Fill the screen while keeping CD+G's 300x216 aspect ratio and hard pixels
const SCREEN_STYLE = {
  width: `min(96vw, calc(88vh * ${CDG_WIDTH} / ${CDG_HEIGHT}))`,
  aspectRatio: `${CDG_WIDTH} / ${CDG_HEIGHT}`,
  imageRendering: "pixelated" as const,
};

interface CdgSurfaceProps {
  audioRef: MediaRef;
  onFailed: () => void;
}

function CdgCanvas({
  data,
  audioRef,
  onFailed,
}: CdgSurfaceProps & { data: Uint8Array }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCdgCanvas(canvasRef, data, audioRef, onFailed);
  return (
    <canvas
      ref={canvasRef}
      data-testid="cdg-canvas"
      width={CDG_WIDTH}
      height={CDG_HEIGHT}
      style={SCREEN_STYLE}
    />
  );
}

function CdgVideo({
  url,
  audioRef,
  onFailed,
}: CdgSurfaceProps & { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoSync(videoRef, audioRef);
  return (
    <video
      ref={videoRef}
      data-testid="cdg-video"
      src={url}
      muted
      playsInline
      preload="auto"
      onError={onFailed}
      style={{ ...SCREEN_STYLE, objectFit: "contain" }}
    />
  );
}

interface CdgDisplayProps {
  song: QueueItem;
  source: Extract<CdgSource, { kind: "canvas" | "video" }>;
  audioRef: MediaRef;
  onFailed: () => void;
}

export function CdgDisplay({
  song,
  source,
  audioRef,
  onFailed,
}: CdgDisplayProps) {
  return (
    <div
      data-testid="cdg-display"
      data-cdg-mode={source.kind}
      className="min-h-screen flex flex-col items-center justify-center bg-black p-4"
    >
      <div className="text-gray-400 text-lg mb-3 truncate max-w-[90vw]">
        {song.mediaItem.title} — {song.mediaItem.artist}
      </div>
      {source.kind === "canvas" ? (
        <CdgCanvas data={source.data} audioRef={audioRef} onFailed={onFailed} />
      ) : (
        <CdgVideo url={source.url} audioRef={audioRef} onFailed={onFailed} />
      )}
    </div>
  );
}
