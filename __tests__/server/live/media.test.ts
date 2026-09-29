import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  prepareSong,
  prepareCard,
  cardLines,
  cleanup,
} from "../../../server/live/media";

const song = {
  id: "q1",
  addedBy: "Ann",
  mediaItem: {
    id: "jellyfin_abc",
    jellyfinId: "abc",
    title: "Song",
    artist: "Band",
    duration: 180,
  },
};

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (url: string) => {
    const route = Object.entries(routes).find(([key]) =>
      url.includes(key)
    )?.[1] ?? { status: 404 };
    const ok = route.status < 300;
    return {
      ok,
      status: route.status,
      arrayBuffer: async () =>
        new TextEncoder().encode(String(route.body ?? "")).buffer,
      json: async () => route.body,
    };
  });
}

describe("live media", () => {
  let dir: string;
  const log = { warn: vi.fn() };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-media-"));
    delete process.env.CDG_MODE;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("uses the CD+G file when the app has one", async () => {
    const fetchImpl = fakeFetch({
      "/api/cdg/abc": { status: 200, body: "CDGDATA" },
    });
    const files = await prepareSong(song, {
      baseUrl: "http://app",
      dir,
      fetchImpl,
      log,
    });
    expect(files.audioUrl).toBe("http://app/api/stream/abc");
    expect(fs.readFileSync(files.cdgPath!, "utf8")).toBe("CDGDATA");
    cleanup(files);
    await vi.waitFor(() => expect(fs.existsSync(files.cdgPath!)).toBe(false));
  });

  it("falls back to lyrics, and to the title when there are none", async () => {
    const withLyrics = fakeFetch({
      "/api/lyrics/jellyfin_abc": {
        status: 200,
        body: { data: { lines: [{ timestamp: 1000, text: "Hello" }] } },
      },
    });
    const files = await prepareSong(song, {
      baseUrl: "http://app",
      dir,
      fetchImpl: withLyrics,
      log,
    });
    expect(fs.readFileSync(files.assPath!, "utf8")).toContain("Hello");
    const none = await prepareSong(song, {
      baseUrl: "http://app",
      dir,
      fetchImpl: fakeFetch({}),
      log,
    });
    expect(fs.readFileSync(none.assPath!, "utf8")).toContain("Song");
  });

  it("skips CD+G with CDG_MODE=off and survives a failing lookup", async () => {
    process.env.CDG_MODE = "off";
    const fetchImpl = fakeFetch({
      "/api/cdg/abc": { status: 200, body: "CDG" },
    });
    const files = await prepareSong(song, {
      baseUrl: "http://app",
      dir,
      fetchImpl,
      log,
    });
    expect(files.cdgPath).toBeUndefined();
    delete process.env.CDG_MODE;
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    const fallback = await prepareSong(song, {
      baseUrl: "http://app",
      dir,
      fetchImpl: failing,
      log,
    });
    expect(fallback.assPath).toBeDefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it("writes each kind of card, with a QR code when the join address is known", async () => {
    expect(
      cardLines({ kind: "nextup", song }, "http://j").map(l => l.text)
    ).toEqual([
      "Up next",
      "Song",
      "Band",
      "Sung by Ann",
      "Scan to join: http://j",
    ]);
    expect(cardLines({ kind: "paused", song }, null)[0].text).toBe("Paused");
    expect(cardLines({ kind: "waiting" }, null)[1].text).toBe("Pick a song!");
    const withQr = await prepareCard(
      { kind: "waiting" },
      { dir, joinUrl: "http://j" }
    );
    expect(fs.existsSync(withQr.qrPath!)).toBe(true);
    const without = await prepareCard(
      { kind: "waiting" },
      { dir, joinUrl: null }
    );
    expect(without.qrPath).toBeUndefined();
  });
});
