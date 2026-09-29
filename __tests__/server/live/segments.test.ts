import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import { SegmentWindow, runItem } from "../../../server/live/segments";

function fakeFs() {
  return { rm: vi.fn((_p: string, _o: unknown, cb: () => void) => cb()) };
}

describe("SegmentWindow", () => {
  it("adds segments, advancing the offset and the next number", () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    const heard = vi.fn();
    window.subscribe(heard);
    window.add("seg_000005.ts", 4);
    window.add("seg_000006.ts", 3.5);
    expect(window.offset).toBe(7.5);
    expect(window.nextNumber).toBe(7);
    expect(window.has("seg_000006.ts")).toBe(true);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest segments and deletes the rest", () => {
    const fs = fakeFs();
    const window = new SegmentWindow("/d", { keep: 2, fsModule: fs });
    ["seg_000001.ts", "seg_000002.ts", "seg_000003.ts"].forEach(n =>
      window.add(n, 4)
    );
    expect(window.segments.map(s => s.name)).toEqual([
      "seg_000002.ts",
      "seg_000003.ts",
    ]);
    expect(fs.rm).toHaveBeenCalledWith(
      "/d/seg_000001.ts",
      { force: true },
      expect.any(Function)
    );
  });

  it("reads new entries from an item playlist once", () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    const seen = new Set<string>();
    const text =
      "#EXTM3U\n#EXTINF:4.000000,\nseg_000001.ts\n#EXTINF:2.5,\nseg_000002.ts\n";
    window.addFromPlaylist(text, seen);
    window.addFromPlaylist(text, seen);
    expect(window.segments).toHaveLength(2);
    expect(window.offset).toBe(6.5);
  });

  it("writes a live HLS playlist", () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    expect(window.playlist()).toContain("#EXT-X-MEDIA-SEQUENCE:0");
    window.add("seg_000009.ts", 4);
    window.add("seg_000010.ts", 5.2);
    const playlist = window.playlist();
    expect(playlist).toContain("#EXT-X-TARGETDURATION:6");
    expect(playlist).toContain("#EXT-X-MEDIA-SEQUENCE:9");
    expect(playlist).toContain("#EXTINF:5.200,\nseg_000010.ts");
    expect(playlist).not.toContain("ENDLIST");
  });
});

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  return child;
}

describe("runItem", () => {
  it("collects the item's segments and reports how ffmpeg ended", async () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    const child = fakeChild();
    const spawn = vi.fn(() => child);
    const readFile = vi.fn(async () => "#EXTINF:4,\nseg_000001.ts\n");
    const run = runItem(window, ["-i", "x"], {
      playlistPath: "/d/item-1.m3u8",
      spawn,
      readFile,
      ffmpeg: "ff",
    });
    expect(spawn).toHaveBeenCalledWith("ff", ["-i", "x"], expect.anything());
    child.stderr.emit("data", "oops");
    child.emit("close", 1);
    await expect(run.done).resolves.toEqual({
      code: 1,
      stopped: false,
      error: "oops",
    });
    expect(window.segments).toHaveLength(1);
  });

  it("stops ffmpeg gently and only once", async () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    const child = fakeChild();
    const run = runItem(window, [], {
      playlistPath: "/d/p.m3u8",
      spawn: () => child,
      readFile: async () => {
        throw new Error("missing");
      },
    });
    const stopping = run.stop();
    run.stop();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", 255);
    await expect(stopping).resolves.toMatchObject({ stopped: true });
  });

  it("reports ffmpeg that can't start", async () => {
    const window = new SegmentWindow("/d", { fsModule: fakeFs() });
    const child = fakeChild();
    const log = { error: vi.fn() };
    const run = runItem(window, [], {
      playlistPath: "/d/p",
      spawn: () => child,
      log,
      readFile: async () => "",
    });
    child.emit("error", new Error("ENOENT"));
    await expect(run.done).resolves.toMatchObject({
      code: -1,
      error: "ENOENT",
    });
    expect(log.error).toHaveBeenCalled();
  });
});
