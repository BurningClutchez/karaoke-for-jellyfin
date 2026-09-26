import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnsureAuth = vi.fn();
vi.mock("@/services/jellyfin", () => ({
  getJellyfinService: () => ({ ensureAuth: mockEnsureAuth }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  clearZipCache,
  getZipAudioSource,
  isZipBacked,
} from "@/services/cdg/zipAudio";

const ctx = { baseUrl: "http://jf", apiKey: "key", userId: "u" };
const auth = { Authorization: 'MediaBrowser Token="key"' };
const prepared = (zipBacked: boolean) => ({
  ok: true,
  status: 200,
  json: async () => ({ ZipBacked: zipBacked, HasCdg: true }),
});

describe("zipped karaoke audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearZipCache();
    mockEnsureAuth.mockResolvedValue(ctx);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("asks the plugin to prepare the song", async () => {
    mockFetch.mockResolvedValue(prepared(true));
    await expect(isZipBacked(ctx, "abc")).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://jf/Karaoke/Prepare/abc",
      expect.objectContaining({
        headers: auth,
      })
    );
  });

  it("caches answers for ten minutes", async () => {
    mockFetch.mockResolvedValue(prepared(false));
    await isZipBacked(ctx, "abc", 0);
    await isZipBacked(ctx, "abc", 9 * 60 * 1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await isZipBacked(ctx, "abc", 11 * 60 * 1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("treats a 404 (no plugin, unknown item) as not zip-backed", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(isZipBacked(ctx, "abc")).resolves.toBe(false);
  });

  it("throws on other errors without caching them", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(isZipBacked(ctx, "abc")).rejects.toThrow("500");
    mockFetch.mockResolvedValueOnce(prepared(true));
    await expect(isZipBacked(ctx, "abc")).resolves.toBe(true);
  });

  it("returns the plugin audio URL for zipped songs", async () => {
    mockFetch.mockResolvedValue(prepared(true));
    await expect(getZipAudioSource("abc")).resolves.toEqual({
      url: "http://jf/Karaoke/Audio/abc",
      headers: auth,
    });
  });

  it("returns null for ordinary songs, bad ids and failures", async () => {
    mockFetch.mockResolvedValue(prepared(false));
    await expect(getZipAudioSource("abc")).resolves.toBeNull();
    await expect(getZipAudioSource("../x")).resolves.toBeNull();
    mockEnsureAuth.mockRejectedValue(new Error("down"));
    await expect(getZipAudioSource("def")).resolves.toBeNull();
  });
});
