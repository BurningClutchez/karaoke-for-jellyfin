import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const mockFetch = vi.fn();
vi.mock("@/lib/jellyfinFetch", () => ({
  jellyfinFetch: (...args: unknown[]) => mockFetch(...args),
  mediaBrowserToken: (key: string) => `MediaBrowser Token="${key}"`,
}));

import {
  fetchGraphicsIds,
  keepSingable,
  lyricsQueryParams,
  resetGraphicsCache,
  songFilter,
} from "@/services/jellyfin-sdk/singable";
import type { JellyfinContext } from "@/services/jellyfin-sdk/types";

const ctx = { baseUrl: "http://jf", apiKey: "key" } as JellyfinContext;
const lyricSong = { Id: "aaa", HasLyrics: true, Path: "/media/a.mp3" };
const cdgSong = { Id: "b-b-b", HasLyrics: false, Path: "/media/b.mp3" };
const plainSong = { Id: "ccc", HasLyrics: false, Path: "/media/c.mp3" };
const songs = [lyricSong, cdgSong, plainSong];
const ids = (list: { Id?: string | null }[]) => list.map(item => item.Id);
const pluginList = (itemIds: string[]) =>
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ItemIds: itemIds }),
  });

describe("song filter setting", () => {
  it("defaults to karaoke and accepts lyrics and all", () => {
    expect(songFilter({})).toBe("karaoke");
    expect(songFilter({ SONG_FILTER: "LYRICS" })).toBe("lyrics");
    expect(songFilter({ SONG_FILTER: "all" })).toBe("all");
    expect(songFilter({ SONG_FILTER: "nonsense" })).toBe("karaoke");
  });
});

describe("keepSingable", () => {
  const env = { ...process.env };
  beforeEach(() => {
    mockFetch.mockReset();
    resetGraphicsCache();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("keeps songs with lyrics or graphics by default", async () => {
    pluginList(["BBB"]);
    const kept = await keepSingable(ctx, songs);
    expect(ids(kept)).toEqual(["aaa", "b-b-b"]);
    expect(kept.map(item => item.HasKaraokeGraphics)).toEqual([
      undefined,
      true,
    ]);
    expect(mockFetch.mock.calls[0][0]).toBe("http://jf/Karaoke/Songs");
    expect(lyricsQueryParams()).toEqual({});
  });

  it("asks the plugin only when a song has no lyrics, and caches the list", async () => {
    pluginList([]);
    await keepSingable(ctx, [lyricSong]);
    expect(mockFetch).not.toHaveBeenCalled();
    await keepSingable(ctx, songs);
    await keepSingable(ctx, songs);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps only songs with lyrics in lyrics mode", async () => {
    process.env.SONG_FILTER = "lyrics";
    expect(ids(await keepSingable(ctx, songs))).toEqual(["aaa"]);
    expect(lyricsQueryParams()).toEqual({ filters: "HasLyrics" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps everything in all mode, still marking graphics", async () => {
    process.env.SONG_FILTER = "all";
    pluginList(["bbb"]);
    const kept = await keepSingable(ctx, songs);
    expect(ids(kept)).toEqual(["aaa", "b-b-b", "ccc"]);
    expect(kept[1].HasKaraokeGraphics).toBe(true);
    expect(kept[2].HasKaraokeGraphics).toBeUndefined();
  });

  it("shows only lyric songs when the plugin is missing and there is no mount", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    delete process.env.CDG_LOCAL_ROOT;
    expect(ids(await keepSingable(ctx, songs))).toEqual(["aaa"]);
    expect(await fetchGraphicsIds(ctx)).toBeNull();
  });

  it("checks the local mount when the plugin can't be reached", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const root = mkdtempSync(path.join(tmpdir(), "singable-"));
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "b.CDG"), "");
    process.env.CDG_LOCAL_ROOT = root;
    process.env.CDG_JELLYFIN_ROOT = "/media";
    try {
      expect(ids(await keepSingable(ctx, songs))).toEqual(["aaa", "b-b-b"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
