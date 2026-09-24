import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { check, loadSettings } from "../../scripts/check-jellyfin";

const settings = {
  JELLYFIN_SERVER_URL: "http://jf/",
  JELLYFIN_API_KEY: "key",
  JELLYFIN_USERNAME: "Karaoke",
};
const json = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

describe("check-jellyfin", () => {
  it("names missing settings and mentions fork secrets", async () => {
    const problems = await check({ ...settings, JELLYFIN_API_KEY: "" });
    expect(problems[0]).toContain("Missing JELLYFIN_API_KEY");
    expect(problems[0]).toContain("forks");
  });

  it("reports an unreachable server", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const problems = await check(settings, fetchImpl);
    expect(problems[0]).toContain("Can't reach Jellyfin");
  });

  it("reports a rejected API key", async () => {
    const problems = await check(
      settings,
      vi.fn().mockResolvedValue(json(401))
    );
    expect(problems[0]).toContain("rejected the API key");
  });

  it("reports other server errors", async () => {
    const problems = await check(
      settings,
      vi.fn().mockResolvedValue(json(500))
    );
    expect(problems[0]).toContain("HTTP 500");
  });

  it("reports a missing user", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200, [{ Name: "admin" }]));
    const problems = await check(settings, fetchImpl);
    expect(problems[0]).toContain('"Karaoke" not found (users: admin)');
  });

  it("passes with the standard auth header", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200, [{ Name: "karaoke" }]));
    await expect(check(settings, fetchImpl)).resolves.toEqual([]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://jf/System/Info");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      'MediaBrowser Token="key"'
    );
  });

  it("reads settings from the environment first, then .env.local", () => {
    const file = path.join(os.tmpdir(), `env-${Date.now()}`);
    fs.writeFileSync(
      file,
      "JELLYFIN_SERVER_URL=http://file\nJELLYFIN_USERNAME=u\n"
    );
    const loaded = loadSettings({ JELLYFIN_SERVER_URL: "http://env" }, file);
    expect(loaded).toEqual({
      JELLYFIN_SERVER_URL: "http://env",
      JELLYFIN_API_KEY: "",
      JELLYFIN_USERNAME: "u",
    });
    fs.unlinkSync(file);
    expect(loadSettings({}, file).JELLYFIN_SERVER_URL).toBe("");
  });
});
