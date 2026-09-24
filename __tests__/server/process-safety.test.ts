import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import {
  installGracefulShutdown,
  installProcessHandlers,
} from "../../server/process-safety";

const log = () => ({ error: vi.fn(), info: vi.fn() });

describe("installProcessHandlers", () => {
  it("logs unhandled rejections and uncaught exceptions", () => {
    const proc = new EventEmitter();
    const logger = log();
    installProcessHandlers(proc, logger);
    proc.emit("unhandledRejection", new Error("r"));
    proc.emit("uncaughtException", new Error("e"));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("installGracefulShutdown", () => {
  it("closes sockets then the server, once, and exits cleanly", () => {
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const server = { close: vi.fn((done: () => void) => done()) };
    const io = { close: vi.fn((done: () => void) => done()) };
    const logger = log();
    installGracefulShutdown({ server, io }, { proc, log: logger });
    proc.emit("SIGTERM");
    proc.emit("SIGINT");
    expect(io.close).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("SIGTERM")
    );
  });

  it("forces an exit if closing hangs", () => {
    vi.useFakeTimers();
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const hang = { close: vi.fn() };
    const shutdown = installGracefulShutdown(
      { server: hang, io: hang },
      { proc, log: log(), timeoutMs: 500 }
    );
    shutdown("SIGTERM");
    vi.advanceTimersByTime(500);
    expect(proc.exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
