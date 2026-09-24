import { describe, it, expect, vi } from "vitest";
import {
  guardSocketHandlers,
  validatePayload,
} from "../../server/socket-guard";

function fakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const socket = {
    id: "s1",
    emit: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
      return socket;
    },
  };
  return { socket, handlers };
}
const log = () => ({ error: vi.fn(), warn: vi.fn() });

describe("validatePayload", () => {
  it("accepts good payloads and events without rules", () => {
    expect(
      validatePayload("join-session", { sessionId: "s", userName: "Ann" })
    ).toBeNull();
    expect(
      validatePayload("add-song", { mediaItem: { id: "1", title: "T" } })
    ).toBeNull();
    expect(
      validatePayload("add-song", {
        mediaItem: { id: "1", title: "T" },
        position: 0,
      })
    ).toBeNull();
    expect(validatePayload("remove-song", { queueItemId: "q" })).toBeNull();
    expect(validatePayload("playback-control", { action: "play" })).toBeNull();
    expect(validatePayload("send-reaction", { emoji: "🎉" })).toBeNull();
    expect(validatePayload("skip-song", undefined)).toBeNull();
  });

  it("rejects bad payloads with a reason", () => {
    expect(validatePayload("join-session", { sessionId: "s" })).toContain(
      "userName"
    );
    expect(validatePayload("add-song", null)).toContain("mediaItem");
    expect(validatePayload("add-song", { mediaItem: { id: "1" } })).toContain(
      "title"
    );
    expect(
      validatePayload("add-song", {
        mediaItem: { id: "1", title: "T" },
        position: -1,
      })
    ).toContain("position");
    expect(validatePayload("remove-song", {})).toContain("queueItemId");
    expect(validatePayload("playback-control", "play")).toContain("action");
    expect(validatePayload("send-reaction", [])).toContain("reaction");
  });
});

describe("guardSocketHandlers", () => {
  it("runs handlers with valid payloads", () => {
    const { socket, handlers } = fakeSocket();
    const handler = vi.fn();
    guardSocketHandlers(socket, log());
    socket.on("remove-song", handler);
    handlers["remove-song"]({ queueItemId: "q" });
    expect(handler).toHaveBeenCalledWith({ queueItemId: "q" });
  });

  it("rejects invalid payloads before the handler runs", () => {
    const { socket, handlers } = fakeSocket();
    const handler = vi.fn();
    const logger = log();
    guardSocketHandlers(socket, logger);
    socket.on("remove-song", handler);
    handlers["remove-song"]({});
    expect(handler).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "INVALID_REQUEST" })
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it("reports thrown errors instead of crashing", () => {
    const { socket, handlers } = fakeSocket();
    const logger = log();
    guardSocketHandlers(socket, logger);
    socket.on("skip-song", () => {
      throw new Error("boom");
    });
    expect(() => handlers["skip-song"]()).not.toThrow();
    expect(logger.error).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "SERVER_ERROR" })
    );
  });

  it("reports rejected promises from async handlers", async () => {
    const { socket, handlers } = fakeSocket();
    const logger = log();
    guardSocketHandlers(socket, logger);
    socket.on("skip-song", async () => {
      throw new Error("async boom");
    });
    handlers["skip-song"]();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(logger.error).toHaveBeenCalled();
  });

  it("survives a socket that can no longer emit", () => {
    const { socket, handlers } = fakeSocket();
    socket.emit.mockImplementation(() => {
      throw new Error("closed");
    });
    guardSocketHandlers(socket, log());
    socket.on("skip-song", () => {
      throw new Error("boom");
    });
    expect(() => handlers["skip-song"]()).not.toThrow();
  });
});
