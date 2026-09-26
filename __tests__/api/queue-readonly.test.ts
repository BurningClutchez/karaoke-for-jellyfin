import { describe, it, expect, afterEach } from "vitest";
import { GET, POST, PUT, DELETE } from "@/app/api/queue/route";

const holder = globalThis as { __karaokeQueueSnapshot?: () => unknown };

describe("/api/queue (read-only)", () => {
  afterEach(() => {
    delete holder.__karaokeQueueSnapshot;
  });

  it("returns 404 when server.js has not published a queue", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("returns 404 when there is no session yet", async () => {
    holder.__karaokeQueueSnapshot = () => null;
    expect((await GET()).status).toBe(404);
  });

  it("returns the live queue from server.js", async () => {
    const snapshot = {
      queue: [{ id: "q1" }],
      currentSong: { id: "q0" },
      playbackState: { isPlaying: true },
      session: { id: "main-session", name: "Karaoke" },
    };
    holder.__karaokeQueueSnapshot = () => snapshot;
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(snapshot);
  });

  it.each([
    ["POST", POST],
    ["PUT", PUT],
    ["DELETE", DELETE],
  ])("answers %s with 410", async (_name, handler) => {
    const response = await handler();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error.code).toBe("QUEUE_READ_ONLY");
  });
});
