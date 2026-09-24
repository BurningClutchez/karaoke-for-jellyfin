"use client";

import { RefObject, useEffect } from "react";
import { CdgDecoder } from "@/lib/cdg/decoder";
import { CDG_HEIGHT, CDG_WIDTH } from "@/lib/cdg/instructions";
import { renderToRgba } from "@/lib/cdg/render";

type MediaRef = RefObject<HTMLMediaElement | null>;

/** Draw the decoder's current frame if it changed since the last draw */
export function drawFrame(
  decoder: CdgDecoder,
  context: CanvasRenderingContext2D,
  image: ImageData,
  seconds: number
): void {
  decoder.seekToTime(seconds);
  if (!decoder.dirty) return;
  renderToRgba(decoder.state, image.data);
  context.putImageData(image, 0, 0);
  decoder.dirty = false;
}

/** Decode CDG data onto a canvas, following the audio element's clock */
export function useCdgCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  data: Uint8Array,
  audioRef: MediaRef,
  onFailed: () => void
): void {
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) {
      onFailed();
      return;
    }

    const decoder = new CdgDecoder(data);
    const image = context.createImageData(CDG_WIDTH, CDG_HEIGHT);
    let frame = 0;
    const tick = () => {
      drawFrame(decoder, context, image, audioRef.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, data, audioRef, onFailed]);
}

const MAX_DRIFT_SECONDS = 0.2;

/** Keep a silent graphics video aligned with the audio that carries the song */
export function syncVideoToAudio(
  video: HTMLVideoElement,
  audio: HTMLMediaElement
): void {
  if (Math.abs(video.currentTime - audio.currentTime) > MAX_DRIFT_SECONDS) {
    video.currentTime = audio.currentTime;
  }
  if (audio.paused && !video.paused) {
    video.pause();
  } else if (!audio.paused && video.paused) {
    video.play().catch(() => {
      // Autoplay can be refused; the next sync tick retries
    });
  }
}

export function useVideoSync(
  videoRef: RefObject<HTMLVideoElement | null>,
  audioRef: MediaRef
): void {
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (video && audio) syncVideoToAudio(video, audio);
    }, 250);
    return () => clearInterval(interval);
  }, [videoRef, audioRef]);
}
