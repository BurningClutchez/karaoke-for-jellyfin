import { describe, it, expect, vi } from "vitest";
import {
  handleReorderQueue,
  movePendingSong,
} from "../../server/queue-reorder";
import { validatePayload } from "../../server/socket-guard";

const item = (id: string, status = "pending") => ({ id, status, position: 0 });
const ids = (queue: { id: string }[]) => queue.map(q => q.id);

describe("movePendingSong", () => {
  it("moves a pending song and keeps the played songs in place", () => {
    const queue = [
      item("done", "completed"),
      item("now", "playing"),
      item("a"),
      item("b"),
      item("c"),
    ];
    expect(movePendingSong(queue, "c", 0)).toBeNull();
    expect(ids(queue)).toEqual(["done", "now", "c", "a", "b"]);
    expect(queue.map(q => q.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("moves a song down and clamps a position past the end", () => {
    const queue = [item("a"), item("b"), item("c")];
    movePendingSong(queue, "a", 99);
    expect(ids(queue)).toEqual(["b", "c", "a"]);
  });

  it("refuses a song that isn't pending", () => {
    const queue = [item("now", "playing"), item("a")];
    expect(movePendingSong(queue, "now", 1)).toBe("SONG_NOT_FOUND");
    expect(movePendingSong(queue, "gone", 0)).toBe("SONG_NOT_FOUND");
    expect(ids(queue)).toEqual(["now", "a"]);
  });
});

describe("handleReorderQueue", () => {
  const setup = () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const socket = { id: "tv", emit: vi.fn() };
    return { io, emit, socket };
  };

  it("reorders and tells everyone", () => {
    const { io, emit, socket } = setup();
    const session = { id: "main-session", queue: [item("a"), item("b")] };
    handleReorderQueue(
      io,
      socket,
      { queueItemId: "b", newPosition: 0 },
      session
    );
    expect(ids(session.queue)).toEqual(["b", "a"]);
    expect(io.to).toHaveBeenCalledWith("main-session");
    expect(emit).toHaveBeenCalledWith("queue-updated", session.queue);
  });

  it("answers an error without a session or a known song", () => {
    const { io, socket } = setup();
    handleReorderQueue(io, socket, { queueItemId: "a", newPosition: 0 }, null);
    handleReorderQueue(
      io,
      socket,
      { queueItemId: "x", newPosition: 0 },
      { id: "main-session", queue: [item("a")] }
    );
    expect(socket.emit.mock.calls.map(c => c[1].code)).toEqual([
      "NOT_IN_SESSION",
      "SONG_NOT_FOUND",
    ]);
    expect(io.to).not.toHaveBeenCalled();
  });

  it("validates the payload", () => {
    expect(
      validatePayload("reorder-queue", { queueItemId: "a", newPosition: 2 })
    ).toBeNull();
    expect(
      validatePayload("reorder-queue", { queueItemId: "a", newPosition: -1 })
    ).toMatch(/newPosition/);
    expect(
      validatePayload("reorder-queue", { queueItemId: "a", newPosition: 1.5 })
    ).toMatch(/newPosition/);
    expect(validatePayload("reorder-queue", {})).toMatch(/queueItemId/);
  });
});
