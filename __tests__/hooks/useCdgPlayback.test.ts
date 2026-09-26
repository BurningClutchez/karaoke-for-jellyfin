import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  drawFrame,
  syncVideoToAudio,
  useCdgCanvas,
  useVideoSync,
} from "@/hooks/useCdgPlayback";
import { CdgDecoder } from "@/lib/cdg/decoder";

const cdgData = () => {
  const data = new Uint8Array(24);
  data[0] = 0x09;
  data[1] = 1; // memory preset
  return data;
};

const fakeContext = () =>
  ({
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: vi.fn(),
  }) as unknown as CanvasRenderingContext2D;

const media = (currentTime: number, paused: boolean) =>
  ({
    currentTime,
    paused,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
  }) as unknown as HTMLVideoElement;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("drawFrame", () => {
  it("draws only when the picture changed", () => {
    const decoder = new CdgDecoder(cdgData());
    const context = fakeContext();
    const image = context.createImageData(300, 216);

    drawFrame(decoder, context, image, 1);
    drawFrame(decoder, context, image, 1);

    expect(context.putImageData).toHaveBeenCalledTimes(1);
    expect(decoder.dirty).toBe(false);
  });
});

describe("useCdgCanvas", () => {
  it("reports failure when the canvas has no 2D context", () => {
    const onFailed = vi.fn();
    const canvasRef = { current: { getContext: () => null } };
    renderHook(() =>
      useCdgCanvas(canvasRef as never, cdgData(), { current: null }, onFailed)
    );
    expect(onFailed).toHaveBeenCalled();
  });

  it("renders frames on animation ticks until unmounted", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const context = fakeContext();
    const canvasRef = { current: { getContext: () => context } };
    const audioRef = { current: media(2, false) };

    const { unmount } = renderHook(() =>
      useCdgCanvas(canvasRef as never, cdgData(), audioRef, vi.fn())
    );
    callbacks[0](0);

    expect(context.putImageData).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(2);
    unmount();
    expect(cancel).toHaveBeenCalledWith(2);
  });
});

describe("syncVideoToAudio", () => {
  it("seeks the video when it drifts from the audio", () => {
    const video = media(10, false);
    syncVideoToAudio(video, media(12, false));
    expect(video.currentTime).toBe(12);
  });

  it("leaves small drift alone", () => {
    const video = media(10, false);
    syncVideoToAudio(video, media(10.1, false));
    expect(video.currentTime).toBe(10);
  });

  it("mirrors pause and play", () => {
    const playing = media(0, false);
    syncVideoToAudio(playing, media(0, true));
    expect(playing.pause).toHaveBeenCalled();

    const paused = media(0, true);
    syncVideoToAudio(paused, media(0, false));
    expect(paused.play).toHaveBeenCalled();
  });

  it("holds the last frame once the audio passes the end of the video", () => {
    const video = Object.assign(media(60, true), { duration: 60 });
    syncVideoToAudio(video, media(75, false));
    expect(video.currentTime).toBe(60);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("resumes when the audio seeks back inside the video", () => {
    const video = Object.assign(media(60, true), { duration: 60 });
    syncVideoToAudio(video, media(30, false));
    expect(video.currentTime).toBe(30);
    expect(video.play).toHaveBeenCalled();
  });

  it("swallows autoplay rejections", async () => {
    const video = media(0, true);
    (video.play as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no"));
    expect(() => syncVideoToAudio(video, media(0, false))).not.toThrow();
  });
});

describe("useVideoSync", () => {
  it("syncs on an interval while mounted", () => {
    vi.useFakeTimers();
    const videoRef = { current: media(0, true) };
    const audioRef = { current: media(5, false) };
    const { unmount } = renderHook(() => useVideoSync(videoRef, audioRef));

    vi.advanceTimersByTime(250);
    expect(videoRef.current.currentTime).toBe(5);

    unmount();
    audioRef.current.currentTime = 9;
    vi.advanceTimersByTime(500);
    expect(videoRef.current.currentTime).toBe(5);
  });

  it("does nothing until both elements exist", () => {
    vi.useFakeTimers();
    renderHook(() => useVideoSync({ current: null }, { current: null }));
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
  });
});
