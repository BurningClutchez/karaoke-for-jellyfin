import { describe, it, expect, vi } from "vitest";
import {
  prepareKaraokeSong,
  prerenderCdgVideo,
  shouldPrerender,
} from "../../server/cdg-prerender";

const env = {
  JELLYFIN_SERVER_URL: "http://jf/",
  JELLYFIN_API_KEY: "key",
  CDG_MODE: "video",
};
const song = { jellyfinId: "abc123" };

describe("shouldPrerender", () => {
  it("is on by default unless graphics are off", () => {
    expect(shouldPrerender({ CDG_MODE: "video" })).toBe(true);
    expect(shouldPrerender({ CDG_MODE: "auto" })).toBe(true);
    expect(shouldPrerender({})).toBe(true);
    expect(shouldPrerender({ CDG_MODE: "OFF" })).toBe(false);
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
      headers: {
        Authorization: 'MediaBrowser Token="key"',
        Range: "bytes=0-0",
      },
    });
  });

  it("skips when disabled, unconfigured or given a bad item", async () => {
    const fetchImpl = vi.fn();
    const cases: [unknown, Record<string, string>][] = [
      [song, { ...env, CDG_MODE: "off" }],
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
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      'MediaBrowser Token=""'
    );
  });
});

describe("prepareKaraokeSong", () => {
  it("asks the plugin to prepare every queued song, whatever the CDG mode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
    const autoMode = { ...env, CDG_MODE: "auto" };
    await expect(
      prepareKaraokeSong(song, { env: autoMode, fetchImpl })
    ).resolves.toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith("http://jf/Karaoke/Prepare/abc123", {
      headers: { Authorization: 'MediaBrowser Token="key"' },
    });
  });

  it("skips bad items or a missing server URL", async () => {
    const fetchImpl = vi.fn();
    await prepareKaraokeSong({ jellyfinId: "../x" }, { env, fetchImpl });
    await prepareKaraokeSong(null, { env, fetchImpl });
    await prepareKaraokeSong(song, {
      env: { ...env, JELLYFIN_SERVER_URL: "" },
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("logs and swallows network errors", async () => {
    const log = { warn: vi.fn() };
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      prepareKaraokeSong(song, { env, fetchImpl, log })
    ).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("sends an empty token when no API key is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404 });
    await prepareKaraokeSong(song, {
      env: { ...env, JELLYFIN_API_KEY: "" },
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      'MediaBrowser Token=""'
    );
  });
});
