import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET, clearHealthCache } from "@/app/api/health/route";

const request = (query = "") =>
  new NextRequest(`http://localhost/api/health${query}`);
const json = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHealthCache();
    process.env.JELLYFIN_SERVER_URL = "http://jf";
    process.env.JELLYFIN_API_KEY = "key";
    process.env.JELLYFIN_USERNAME = "admin";
  });

  it("reports ok with the karaoke plugin status", async () => {
    mockFetch
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200, [{ Name: "admin" }]))
      .mockResolvedValueOnce(json(200, { Version: "1.0.0.0" }));
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.karaokePlugin).toEqual({ installed: true, Version: "1.0.0.0" });
  });

  it("reports a missing plugin", async () => {
    mockFetch
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200, [{ Name: "admin" }]))
      .mockResolvedValueOnce(json(404));
    const body = await (await GET(request())).json();
    expect(body.karaokePlugin).toEqual({ installed: false });
  });

  it("stays 200 when Jellyfin has problems, unless strict", async () => {
    mockFetch.mockResolvedValue(json(401));
    const relaxed = await GET(request());
    expect(relaxed.status).toBe(200);
    const body = await relaxed.json();
    expect(body.status).toBe("degraded");
    expect(body.jellyfin.problems[0]).toContain("rejected the API key");
    // Served from the 10 s cache
    expect((await GET(request("?strict=1"))).status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("treats a plugin request error as not installed", async () => {
    mockFetch
      .mockResolvedValueOnce(json(200))
      .mockResolvedValueOnce(json(200, [{ Name: "admin" }]))
      .mockRejectedValue(new Error("network"));
    const body = await (await GET(request())).json();
    expect(body.karaokePlugin.installed).toBe(false);
  });
});
