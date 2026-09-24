import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockEnsureAuth = vi.fn();
vi.mock("@/services/jellyfin", () => ({
  getJellyfinService: () => ({ ensureAuth: mockEnsureAuth }),
}));

const mockGetCdgFile = vi.fn();
vi.mock("@/services/cdg/source", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/cdg/source")>()),
  getCdgFile: (...args: unknown[]) => mockGetCdgFile(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET as getCdg } from "@/app/api/cdg/[itemId]/route";
import { GET as getVideo } from "@/app/api/cdg/[itemId]/video/route";

const ctx = { baseUrl: "http://jf", apiKey: "key", userId: "u" };
const params = (itemId: string) => ({ params: Promise.resolve({ itemId }) });
const request = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/cdg/abc", { headers });

describe("GET /api/cdg/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureAuth.mockResolvedValue(ctx);
  });

  it("rejects invalid item IDs", async () => {
    const response = await getCdg(request(), params("../x"));
    expect(response.status).toBe(400);
  });

  it("returns the CDG bytes with their source", async () => {
    mockGetCdgFile.mockResolvedValue({
      data: new Uint8Array([9, 1, 2]),
      source: "local",
    });
    const response = await getCdg(request(), params("abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cdg-Source")).toBe("local");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([9, 1, 2])
    );
    expect(mockGetCdgFile).toHaveBeenCalledWith(ctx, "abc");
  });

  it("returns 404 when no CDG exists", async () => {
    mockGetCdgFile.mockResolvedValue(null);
    const response = await getCdg(request(), params("abc"));
    expect(response.status).toBe(404);
  });

  it("returns 500 when Jellyfin auth fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnsureAuth.mockRejectedValue(new Error("down"));
    const response = await getCdg(request(), params("abc"));
    expect(response.status).toBe(500);
  });
});

describe("GET /api/cdg/[itemId]/video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureAuth.mockResolvedValue(ctx);
  });

  it("rejects invalid item IDs", async () => {
    const response = await getVideo(request(), params("a/b"));
    expect(response.status).toBe(400);
  });

  it("proxies the plugin video with range headers", async () => {
    mockFetch.mockResolvedValue(
      new Response("mp4", {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-2/3",
          "x-internal": "hidden",
        },
      })
    );
    const response = await getVideo(
      request({ range: "bytes=0-" }),
      params("abc")
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toBe("bytes 0-2/3");
    expect(response.headers.get("x-internal")).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("http://jf/Karaoke/Video/abc", {
      headers: { Authorization: 'MediaBrowser Token="key"', Range: "bytes=0-" },
    });
  });

  it("forwards only the webm format to the plugin", async () => {
    mockFetch.mockResolvedValue(new Response("x", { status: 200 }));
    const webm = new NextRequest(
      "http://localhost/api/cdg/abc/video?format=webm"
    );
    await getVideo(webm, params("abc"));
    expect(mockFetch.mock.calls[0][0]).toBe(
      "http://jf/Karaoke/Video/abc?format=webm"
    );

    const other = new NextRequest(
      "http://localhost/api/cdg/abc/video?format=x&y"
    );
    await getVideo(other, params("abc"));
    expect(mockFetch.mock.calls[1][0]).toBe("http://jf/Karaoke/Video/abc");
  });

  it("passes through plugin errors such as 404", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await getVideo(request(), params("abc"));
    expect(response.status).toBe(404);
  });

  it("returns 502 when the plugin sends no body", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const response = await getVideo(request(), params("abc"));
    expect(response.status).toBe(502);
  });

  it("returns 500 when the proxy throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error("network"));
    const response = await getVideo(request(), params("abc"));
    expect(response.status).toBe(500);
  });
});
