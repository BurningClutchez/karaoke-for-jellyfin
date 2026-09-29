import { describe, it, expect, vi } from "vitest";
import { createLiveChannel, liveSettings } from "../../../server/live";

describe("liveSettings", () => {
  it("is off by default", () => {
    expect(liveSettings({})).toEqual({
      enabled: false,
      nextUpSeconds: 8,
      ffmpeg: "ffmpeg",
      joinUrl: null,
    });
  });

  it("reads the settings", () => {
    expect(
      liveSettings({
        LIVE_CHANNEL: "TRUE",
        LIVE_NEXT_UP_SECONDS: "5",
        FFMPEG_PATH: "/usr/bin/ffmpeg",
        PUBLIC_URL: "http://192.168.1.60:3000/",
      })
    ).toEqual({
      enabled: true,
      nextUpSeconds: 5,
      ffmpeg: "/usr/bin/ffmpeg",
      joinUrl: "http://192.168.1.60:3000",
    });
    expect(liveSettings({ LIVE_NEXT_UP_SECONDS: "soon" }).nextUpSeconds).toBe(
      8
    );
  });
});

describe("createLiveChannel", () => {
  it("returns nothing when the channel is off", () => {
    expect(
      createLiveChannel({
        port: 3000,
        getSession: () => null,
        actions: {},
        env: {},
      })
    ).toBeNull();
  });

  it("sets up the channel and warns when ffmpeg is missing", async () => {
    const log = { error: vi.fn(), info: vi.fn() };
    const live = createLiveChannel({
      port: 3000,
      getSession: () => null,
      actions: {},
      env: { LIVE_CHANNEL: "true", FFMPEG_PATH: "/nonexistent/ffmpeg" },
      log,
    });
    expect(live).not.toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("ffmpeg wasn't found")
    );
    expect(live!.channel.status()).toMatchObject({
      watched: false,
      showing: null,
    });
    await live!.stop();
  });
});
