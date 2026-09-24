import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QueueItem } from "@/types";

vi.mock("@/components/tv/LyricsDisplay", () => ({
  LyricsDisplay: () => <div data-testid="lyrics-display" />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { SongDisplay } from "@/components/tv/SongDisplay";

const song = {
  id: "q1",
  mediaItem: {
    id: "jellyfin_abc",
    jellyfinId: "abc",
    title: "Song",
    artist: "Singer",
    duration: 200,
    streamUrl: "/api/stream/abc",
  },
} as unknown as QueueItem;

const validCdg = new Uint8Array(24);
validCdg[0] = 0x09;

const renderSong = (
  cdgMode: "auto" | "canvas" | "video" | "off",
  withAudio = true
) =>
  render(
    <SongDisplay
      song={song}
      playbackState={null}
      isConnected
      cdgMode={cdgMode}
      audioRef={withAudio ? { current: null } : undefined}
    />
  );

describe("SongDisplay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows lyrics while loading and when no CDG exists", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    renderSong("auto");
    expect(screen.getByTestId("lyrics-display")).toBeInTheDocument();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByTestId("lyrics-display")).toBeInTheDocument();
  });

  it("never looks for CDG without an audio clock or when off", () => {
    renderSong("auto", false);
    renderSong("off");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back from canvas to video when the canvas cannot draw", async () => {
    // jsdom has no 2D canvas context, so the canvas reports failure
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => validCdg.buffer,
    });
    renderSong("auto");
    await waitFor(() =>
      expect(screen.getByTestId("cdg-video")).toBeInTheDocument()
    );
    expect(screen.getByTestId("cdg-display")).toHaveAttribute(
      "data-cdg-mode",
      "video"
    );
    expect(screen.getByText("Song — Singer")).toBeInTheDocument();
  });

  it("shows the canvas when it can draw", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      createImageData: () => ({ data: new Uint8ClampedArray(300 * 216 * 4) }),
      putImageData: vi.fn(),
    } as never);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => validCdg.buffer,
    });
    renderSong("canvas");
    await waitFor(() =>
      expect(screen.getByTestId("cdg-canvas")).toBeInTheDocument()
    );
  });

  it("shows a badge when graphics were expected but failed", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    renderSong("auto");
    await waitFor(() =>
      expect(screen.getByTestId("cdg-unavailable")).toBeInTheDocument()
    );
    expect(screen.getByTestId("lyrics-display")).toBeInTheDocument();
  });

  it("returns to lyrics when the plugin video fails", () => {
    renderSong("video");
    const videoElement = screen.getByTestId("cdg-video");
    expect(videoElement).toHaveAttribute("src", "/api/cdg/abc/video");
    fireEvent.error(videoElement);
    expect(screen.getByTestId("lyrics-display")).toBeInTheDocument();
  });
});
