import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockReport = vi.fn();
vi.mock("@/lib/clientLog", () => ({
  reportClientError: (...args: unknown[]) => mockReport(...args),
}));

import {
  STALL_TIMEOUT_MS,
  describeMediaError,
  useAudioRecovery,
} from "@/hooks/useAudioRecovery";

function fakeAudio() {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "paused", { value: false, writable: true });
  audio.load = vi.fn();
  audio.play = vi.fn().mockResolvedValue(undefined);
  return audio;
}
const setError = (audio: HTMLAudioElement, code: number) =>
  Object.defineProperty(audio, "error", {
    value: { code },
    configurable: true,
  });

describe("describeMediaError", () => {
  it("explains each error code", () => {
    expect(describeMediaError({ code: 1 } as MediaError)).toContain("aborted");
    expect(describeMediaError({ code: 2 } as MediaError)).toBe("network error");
    expect(describeMediaError({ code: 3 } as MediaError)).toContain("decoded");
    expect(describeMediaError({ code: 4 } as MediaError)).toContain("format");
    expect(describeMediaError(null)).toBe("unknown playback error");
  });
});

describe("useAudioRecovery", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("retries once from the same position, then gives up", () => {
    const audio = fakeAudio();
    const onGiveUp = vi.fn();
    renderHook(() => useAudioRecovery({ current: audio }, "song1", onGiveUp));

    audio.currentTime = 42;
    setError(audio, 2);
    audio.dispatchEvent(new Event("error"));
    expect(audio.load).toHaveBeenCalledTimes(1);
    audio.currentTime = 0;
    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(audio.currentTime).toBe(42);
    expect(audio.play).toHaveBeenCalled();

    audio.dispatchEvent(new Event("error"));
    audio.dispatchEvent(new Event("error"));
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledWith("network error");
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "Song song1 failed: network error"
    );
  });

  it("treats a long stall while playing as a failure", () => {
    vi.useFakeTimers();
    const audio = fakeAudio();
    renderHook(() => useAudioRecovery({ current: audio }, "song1", vi.fn()));
    audio.dispatchEvent(new Event("waiting"));
    vi.advanceTimersByTime(STALL_TIMEOUT_MS);
    expect(audio.load).toHaveBeenCalledTimes(1);
  });

  it("ignores stalls that recover, and stalls while paused", () => {
    vi.useFakeTimers();
    const audio = fakeAudio();
    renderHook(() => useAudioRecovery({ current: audio }, "song1", vi.fn()));
    audio.dispatchEvent(new Event("stalled"));
    audio.dispatchEvent(new Event("timeupdate"));
    vi.advanceTimersByTime(STALL_TIMEOUT_MS);
    Object.defineProperty(audio, "paused", { value: true });
    audio.dispatchEvent(new Event("waiting"));
    vi.advanceTimersByTime(STALL_TIMEOUT_MS);
    expect(audio.load).not.toHaveBeenCalled();
  });

  it("starts fresh for each song and does nothing without one", () => {
    const audio = fakeAudio();
    const onGiveUp = vi.fn();
    const { rerender } = renderHook(
      ({ id }) => useAudioRecovery({ current: audio }, id, onGiveUp),
      { initialProps: { id: "a" as string | undefined } }
    );
    audio.dispatchEvent(new Event("error"));
    rerender({ id: "b" });
    audio.dispatchEvent(new Event("error"));
    expect(onGiveUp).not.toHaveBeenCalled();
    rerender({ id: undefined });
    audio.dispatchEvent(new Event("error"));
    expect(audio.load).toHaveBeenCalledTimes(2);
  });
});
