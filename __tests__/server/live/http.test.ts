import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import fs from "fs";
import os from "os";
import path from "path";
import { handleLiveRequest, channelM3u } from "../../../server/live/http";
import { SegmentWindow } from "../../../server/live/segments";

function request(url: string, headers: Record<string, string> = {}) {
  return Object.assign(new EventEmitter(), {
    url,
    method: "GET",
    headers: { host: "192.168.1.60:3000", ...headers },
  });
}

function response() {
  const res = Object.assign(new PassThrough(), {
    status: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers: Record<string, string> = {}) {
      res.status = status;
      res.headers = headers;
      return res;
    },
  });
  res.on("data", chunk => (res.body += chunk));
  return res;
}

describe("live channel HTTP", () => {
  let dir: string;
  let window: SegmentWindow;
  let channel: {
    joinUrl: string | null;
    addViewer: ReturnType<typeof vi.fn>;
    touch: ReturnType<typeof vi.fn>;
    status: () => object;
  };
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-test-"));
    window = new SegmentWindow(dir);
    leave = vi.fn();
    channel = {
      joinUrl: null,
      addViewer: vi.fn(() => leave),
      touch: vi.fn(),
      status: () => ({ watched: false }),
    };
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const live = () => ({ channel, window });

  it("ignores other URLs and methods", () => {
    expect(handleLiveRequest(request("/api/queue"), response(), live())).toBe(
      false
    );
    const post = Object.assign(request("/api/live/status"), { method: "POST" });
    expect(handleLiveRequest(post, response(), live())).toBe(false);
    expect(
      handleLiveRequest(request("/api/live/nope"), response(), live())
    ).toBe(false);
  });

  it("serves the M3U with absolute stream URLs and learns the join address", () => {
    const res = response();
    handleLiveRequest(request("/api/live/channel.m3u"), res, live());
    expect(res.status).toBe(200);
    expect(res.body).toContain("http://192.168.1.60:3000/api/live/stream.ts");
    expect(res.body).toContain("Karaoke Party");
    expect(channel.joinUrl).toBe("http://192.168.1.60:3000");
    const hls = channelM3u(
      request("/", { "x-forwarded-proto": "https" }),
      "hls"
    );
    expect(hls).toContain("https://192.168.1.60:3000/api/live/stream.m3u8");
  });

  it("reports status without setting the join address", () => {
    const res = response();
    handleLiveRequest(request("/api/live/status"), res, live());
    expect(JSON.parse(res.body)).toEqual({ watched: false });
    expect(channel.joinUrl).toBeNull();
  });

  it("serves segments in the window only", async () => {
    fs.writeFileSync(path.join(dir, "seg_000001.ts"), "AAA");
    window.add("seg_000001.ts", 4);
    const res = response();
    handleLiveRequest(request("/api/live/seg_000001.ts"), res, live());
    await new Promise(r => res.on("end", r));
    expect(res.body).toBe("AAA");
    expect(channel.touch).toHaveBeenCalled();
    const missing = response();
    handleLiveRequest(request("/api/live/seg_000002.ts"), missing, live());
    expect(missing.status).toBe(404);
  });

  it("returns the HLS playlist once there are segments", async () => {
    ["seg_000001.ts", "seg_000002.ts"].forEach(n => window.add(n, 4));
    const res = response();
    handleLiveRequest(request("/api/live/stream.m3u8"), res, live());
    await new Promise(r => res.on("end", r));
    expect(res.body).toContain("seg_000002.ts");
    expect(channel.touch).toHaveBeenCalled();
  });

  it("streams the latest segments, then new ones, until the viewer leaves", async () => {
    fs.writeFileSync(path.join(dir, "seg_000001.ts"), "one;");
    window.add("seg_000001.ts", 4);
    const req = request("/api/live/stream.ts");
    const res = response();
    handleLiveRequest(req, res, live());
    expect(channel.addViewer).toHaveBeenCalled();
    fs.writeFileSync(path.join(dir, "seg_000002.ts"), "two;");
    window.add("seg_000002.ts", 4);
    window.add("seg_000003.ts", 4); // already gone: skipped
    fs.writeFileSync(path.join(dir, "seg_000004.ts"), "four;");
    window.add("seg_000004.ts", 4);
    await vi.waitFor(() => expect(res.body).toBe("one;two;four;"));
    req.emit("close");
    expect(leave).toHaveBeenCalled();
  });
});
