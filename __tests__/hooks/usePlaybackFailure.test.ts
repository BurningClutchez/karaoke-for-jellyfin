import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlaybackFailure } from "@/hooks/tv-display/usePlaybackFailure";
import type { QueueItem } from "@/types";

describe("usePlaybackFailure", () => {
  it("reports the song to the server and skips it", () => {
    const socket = { emit: vi.fn() };
    const skipSong = vi.fn();
    const song = { mediaItem: { title: "My Song" } } as QueueItem;
    const { result } = renderHook(() =>
      usePlaybackFailure(socket as never, song, skipSong)
    );
    result.current("network error");
    expect(socket.emit).toHaveBeenCalledWith("playback-failed", {
      title: "My Song",
      reason: "network error",
    });
    expect(skipSong).toHaveBeenCalled();
  });

  it("still skips without a socket or song", () => {
    const skipSong = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackFailure(null, null, skipSong)
    );
    result.current("x");
    expect(skipSong).toHaveBeenCalled();
  });
});
