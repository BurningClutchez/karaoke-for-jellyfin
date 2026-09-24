import { describe, it, expect, vi } from "vitest";
import { prerenderCdgVideo, shouldPrerender } from "../../server/cdg-prerender";

const env = {
  JELLYFIN_SERVER_URL: "http://jf/",
  JELLYFIN_API_KEY: "key",
  CDG_MODE: "video",
};
const song = { jellyfinId: "abc123" };

describe("shouldPrerender", () => {
  it("is on by default only in video mode", () => {
    expect(shouldPrerender({ CDG_MODE: "video" })).toBe(true);
    expect(shouldPrerender({ CDG_MODE: "VIDEO" })).toBe(true);
    expect(shouldPrerender({ CDG_MODE: "auto" })).toBe(false);
    expect(shouldPrerender({})).toBe(false);
  });

  it("can be forced on or off", () => {
    expect(shouldPrerender({ CDG_MODE: "auto", CDG_PRERENDER: "true" })).toBe(
      true
    );
    expect(shouldPrerender({ CDG_MODE: "video", CDG_PRERENDER: "False" })).toBe(
      false
    );
  });
});

describe("prerenderCdgVideo", () => {
  it("asks the plugin for one byte of the video", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 206 });
    await expect(prerenderCdgVideo(song, { env, fetchImpl })).resolves.toBe(
      206
    );
    expect(fetchImpl).toHaveBeenCalledWith("http://jf/Karaoke/Video/abc123", {
      headers: { "X-Emby-Token": "key", Range: "bytes=0-0" },
    });
  });

  it("skips when disabled, unconfigured or given a bad item", async () => {
    const fetchImpl = vi.fn();
    const cases: [unknown, Record<string, string>][] = [
      [song, { ...env, CDG_MODE: "auto" }],
      [song, { ...env, JELLYFIN_SERVER_URL: "" }],
      [{ jellyfinId: "../x" }, env],
      [{}, env],
      [null, env],
    ];
    for (const [item, caseEnv] of cases) {
      await expect(
        prerenderCdgVideo(item, { env: caseEnv, fetchImpl })
      ).resolves.toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("logs and swallows network errors", async () => {
    const log = { warn: vi.fn() };
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      prerenderCdgVideo(song, { env, fetchImpl, log })
    ).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      "CDG video pre-render failed:",
      "offline"
    );
  });

  it("sends an empty token when no API key is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404 });
    const noKey = { ...env, JELLYFIN_API_KEY: "" };
    await expect(
      prerenderCdgVideo(song, { env: noKey, fetchImpl })
    ).resolves.toBe(404);
    expect(fetchImpl.mock.calls[0][1].headers["X-Emby-Token"]).toBe("");
  });
});
