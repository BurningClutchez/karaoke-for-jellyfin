import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NOTICE_MS,
  setupNoticeHandlers,
} from "@/hooks/useWebSocket/noticeHandlers";

function fakeSocket() {
  const handlers: Record<string, (payload: unknown) => void> = {};
  return {
    handlers,
    socket: {
      on: (event: string, fn: (payload: unknown) => void) =>
        (handlers[event] = fn),
    },
  };
}

describe("setupNoticeHandlers", () => {
  afterEach(() => vi.useRealTimers());

  it("shows notices and errors, then clears them", () => {
    vi.useFakeTimers();
    let shown: string | null = null;
    const setError = vi.fn(update => {
      shown = typeof update === "function" ? update(shown) : update;
    });
    const { socket, handlers } = fakeSocket();
    setupNoticeHandlers(socket as never, setError);

    handlers.notice({ message: '"Song" was skipped' });
    expect(shown).toBe('"Song" was skipped');
    handlers.error({ code: "SERVER_ERROR", message: "Something went wrong" });
    expect(shown).toBe("Something went wrong");
    vi.advanceTimersByTime(NOTICE_MS);
    expect(shown).toBeNull();
  });

  it("leaves a newer message in place and ignores quiet or empty ones", () => {
    vi.useFakeTimers();
    let shown: string | null = null;
    const setError = vi.fn(update => {
      shown = typeof update === "function" ? update(shown) : update;
    });
    const { socket, handlers } = fakeSocket();
    setupNoticeHandlers(socket as never, setError);

    handlers.notice({ message: "first" });
    shown = "Connection lost";
    vi.advanceTimersByTime(NOTICE_MS);
    expect(shown).toBe("Connection lost");
    handlers.error({ code: "NOT_IN_SESSION", message: "join first" });
    handlers.notice({});
    handlers.error(null);
    expect(shown).toBe("Connection lost");
  });
});
