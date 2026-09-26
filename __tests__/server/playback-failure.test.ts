import { describe, it, expect, vi } from "vitest";
import { handlePlaybackFailed } from "../../server/playback-failure";
import { validatePayload } from "../../server/socket-guard";

describe("handlePlaybackFailed", () => {
  const setup = () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    return { io, emit, socket: { id: "tv1" }, log: { warn: vi.fn() } };
  };

  it("logs and tells the session the song was skipped", () => {
    const { io, emit, socket, log } = setup();
    handlePlaybackFailed(
      io,
      socket,
      { title: "Song", reason: "network error" },
      { id: "main" },
      log
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('"Song" failed')
    );
    expect(io.to).toHaveBeenCalledWith("main");
    expect(emit).toHaveBeenCalledWith("notice", {
      level: "warn",
      message: '"Song" couldn\'t play (network error) and was skipped',
    });
  });

  it("only logs when there is no session, and clips long text", () => {
    const { io, socket, log } = setup();
    handlePlaybackFailed(
      io,
      socket,
      { title: "x".repeat(300), reason: "" },
      null,
      log
    );
    expect(io.to).not.toHaveBeenCalled();
    expect(log.warn.mock.calls[0][0]).toContain("unknown error");
    expect(log.warn.mock.calls[0][0]).not.toContain("x".repeat(201));
  });

  it("is validated by the socket guard", () => {
    expect(
      validatePayload("playback-failed", { title: "t", reason: "r" })
    ).toBeNull();
    expect(validatePayload("playback-failed", { title: "t" })).toContain(
      "reason"
    );
  });
});
