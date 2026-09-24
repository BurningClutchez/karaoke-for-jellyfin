import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  cdgSourceFromData,
  fallbackCdgSource,
  cdgVideoUrl,
  initialCdgSource,
  preferredVideoFormat,
  useCdgSource,
} from "@/hooks/useCdgSource";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const validCdg = new Uint8Array(24).fill(0);
validCdg[0] = 0x09;
const notCdg = new Uint8Array(24);
const video = { kind: "video", url: "/api/cdg/abc/video" };

describe("CDG source decisions", () => {
  it("starts as none without an item or when disabled", () => {
    expect(initialCdgSource(undefined, "auto")).toEqual({ kind: "none" });
    expect(initialCdgSource("abc", "off")).toEqual({ kind: "none" });
  });

  it("goes straight to video in video mode", () => {
    expect(initialCdgSource("abc", "video")).toEqual(video);
  });

  it("loads the raw file in auto and canvas modes", () => {
    expect(initialCdgSource("abc", "auto").kind).toBe("loading");
    expect(initialCdgSource("abc", "canvas").kind).toBe("loading");
  });

  it("uses the canvas for valid CDG data", () => {
    expect(cdgSourceFromData("abc", "auto", validCdg)).toEqual({
      kind: "canvas",
      data: validCdg,
    });
  });

  it("shows lyrics when there is no CDG", () => {
    expect(cdgSourceFromData("abc", "auto", null)).toEqual({ kind: "none" });
  });

  it("tries video for unreadable data only in auto mode", () => {
    expect(cdgSourceFromData("abc", "auto", notCdg)).toEqual(video);
    expect(cdgSourceFromData("abc", "canvas", notCdg)).toEqual({
      kind: "none",
    });
  });

  it("falls back canvas -> video -> lyrics", () => {
    const canvas = { kind: "canvas" as const, data: validCdg };
    expect(fallbackCdgSource(canvas, "abc", "auto")).toEqual(video);
    expect(fallbackCdgSource(canvas, "abc", "canvas")).toEqual({
      kind: "none",
    });
    expect(
      fallbackCdgSource({ kind: "video", url: "x" }, "abc", "auto")
    ).toEqual({ kind: "none" });
  });
});

describe("video format", () => {
  const stubCanPlay = (supported: string[]) =>
    vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockImplementation(type =>
        supported.some(s => type.includes(s)) ? "probably" : ""
      );

  afterEach(() => vi.restoreAllMocks());

  it("prefers H.264 MP4 when the browser plays it", () => {
    stubCanPlay(["avc1", "vp9"]);
    expect(preferredVideoFormat()).toBe("mp4");
  });

  it("uses VP9 WebM when H.264 is missing", () => {
    stubCanPlay(["vp9"]);
    expect(preferredVideoFormat()).toBe("webm");
    expect(cdgVideoUrl("abc")).toBe("/api/cdg/abc/video?format=webm");
  });

  it("falls back to MP4 when neither is reported", () => {
    stubCanPlay([]);
    expect(preferredVideoFormat()).toBe("mp4");
    expect(cdgVideoUrl("a b", "mp4")).toBe("/api/cdg/a%20b/video");
  });
});

describe("useCdgSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches the CDG file and switches to the canvas", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => validCdg.buffer,
    });
    const { result } = renderHook(() => useCdgSource("abc", "auto"));
    expect(result.current.source.kind).toBe("loading");
    await waitFor(() => expect(result.current.source.kind).toBe("canvas"));
    expect(mockFetch.mock.calls[0][0]).toBe("/api/cdg/abc");
  });

  it("settles on none when the request fails", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useCdgSource("abc", "auto"));
    await waitFor(() => expect(result.current.source.kind).toBe("none"));
  });

  it("settles on none for a 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const { result } = renderHook(() => useCdgSource("abc", "auto"));
    await waitFor(() => expect(result.current.source.kind).toBe("none"));
  });

  it("does not fetch in video mode and falls back to none", () => {
    const { result } = renderHook(() => useCdgSource("abc", "video"));
    expect(result.current.source).toEqual(video);
    act(() => result.current.fallBack());
    expect(result.current.source).toEqual({ kind: "none" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("restarts when the song changes", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const { result, rerender } = renderHook(
      ({ id }) => useCdgSource(id, "auto"),
      {
        initialProps: { id: "abc" },
      }
    );
    await waitFor(() => expect(result.current.source.kind).toBe("none"));
    rerender({ id: "def" });
    expect(result.current.source.kind).toBe("loading");
    await waitFor(() => expect(result.current.source.kind).toBe("none"));
    expect(mockFetch.mock.calls[1][0]).toBe("/api/cdg/def");
  });
});
