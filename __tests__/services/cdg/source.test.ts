import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadFile = vi.fn();
vi.mock("fs/promises", () => {
  const readFile = (...args: unknown[]) => mockReadFile(...args);
  return { readFile, default: { readFile } };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getCdgFile,
  getItemPath,
  isValidItemId,
  pluginUrl,
} from "@/services/cdg/source";

const ctx = { baseUrl: "http://jf", apiKey: "key", userId: "user1" };
const itemJson = (body: unknown) => ({ ok: true, json: async () => body });
const bytes = (values: number[]) => ({
  ok: true,
  arrayBuffer: async () => new Uint8Array(values).buffer,
});

describe("CDG source lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CDG_LOCAL_ROOT = "/music";
    process.env.CDG_JELLYFIN_ROOT = "/media/music";
  });

  afterEach(() => {
    delete process.env.CDG_LOCAL_ROOT;
    delete process.env.CDG_JELLYFIN_ROOT;
  });

  it("validates item IDs", () => {
    expect(isValidItemId("0123abcd-ef")).toBe(true);
    expect(isValidItemId("../Items")).toBe(false);
    expect(isValidItemId("")).toBe(false);
  });

  it("builds plugin URLs", () => {
    expect(pluginUrl(ctx, "Video", "abc")).toBe("http://jf/Karaoke/Video/abc");
  });

  it("requests the item Path field with the API key", async () => {
    mockFetch.mockResolvedValueOnce(itemJson({ Path: "/media/music/a.mp3" }));
    await expect(getItemPath(ctx, "abc")).resolves.toBe("/media/music/a.mp3");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://jf/Items/abc?userId=user1&fields=Path",
      { headers: { "X-Emby-Token": "key" } }
    );
  });

  it("returns null when the item has no path or cannot be fetched", async () => {
    mockFetch.mockResolvedValueOnce(itemJson({}));
    await expect(getItemPath(ctx, "abc")).resolves.toBeNull();
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(getItemPath(ctx, "abc")).resolves.toBeNull();
  });

  it("reads the sidecar from the local mount first (option A)", async () => {
    mockFetch.mockResolvedValueOnce(itemJson({ Path: "/media/music/a.mp3" }));
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    mockReadFile.mockResolvedValueOnce(Buffer.from([9, 1]));

    const file = await getCdgFile(ctx, "abc");

    expect(file?.source).toBe("local");
    expect(Array.from(file!.data)).toEqual([9, 1]);
    expect(mockReadFile).toHaveBeenNthCalledWith(1, "/music/a.cdg");
    expect(mockReadFile).toHaveBeenNthCalledWith(2, "/music/a.CDG");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plugin when no local file exists (option B)", async () => {
    mockFetch
      .mockResolvedValueOnce(itemJson({ Path: "/media/music/a.mp3" }))
      .mockResolvedValueOnce(bytes([9, 2]));
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const file = await getCdgFile(ctx, "abc");

    expect(file?.source).toBe("plugin");
    expect(mockFetch).toHaveBeenLastCalledWith("http://jf/Karaoke/Cdg/abc", {
      headers: { "X-Emby-Token": "key" },
    });
  });

  it("skips the local lookup when no mount is configured", async () => {
    delete process.env.CDG_LOCAL_ROOT;
    mockFetch.mockResolvedValueOnce(bytes([9]));
    await expect(getCdgFile(ctx, "abc")).resolves.toMatchObject({
      source: "plugin",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips the local lookup for paths outside the mapped root", async () => {
    mockFetch
      .mockResolvedValueOnce(itemJson({ Path: "/elsewhere/a.mp3" }))
      .mockResolvedValueOnce({ ok: false });
    await expect(getCdgFile(ctx, "abc")).resolves.toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("returns null when both lookups fail or throw", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: false });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(getCdgFile(ctx, "abc")).resolves.toBeNull();
  });

  it("returns null when the item lookup fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    await expect(getCdgFile(ctx, "abc")).resolves.toBeNull();
  });
});
