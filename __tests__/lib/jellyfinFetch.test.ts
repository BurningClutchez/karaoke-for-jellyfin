import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  JellyfinTimeoutError,
  jellyfinFetch,
  redactUrl,
} from "@/lib/jellyfinFetch";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
const ok = (status = 200) => ({ ok: status < 400, status });

describe("jellyfinFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("passes the request through with an abort signal", async () => {
    mockFetch.mockResolvedValue(ok());
    await expect(
      jellyfinFetch("http://jf/a", { headers: { A: "1" } })
    ).resolves.toEqual(ok());
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ A: "1" });
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("times out when Jellyfin doesn't answer, without retrying", async () => {
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new Error("aborted"))
          )
        )
    );
    const result = jellyfinFetch("http://jf/a?api_key=secret", {}, 1000);
    const assertion = expect(result).rejects.toThrow(JellyfinTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    await expect(result).rejects.toThrow("api_key=***");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a read-only request once after a network error", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(ok());
    const result = jellyfinFetch("http://jf/a");
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toEqual(ok());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries once when Jellyfin is briefly unavailable", async () => {
    mockFetch.mockResolvedValueOnce(ok(503)).mockResolvedValueOnce(ok(503));
    const result = jellyfinFetch("http://jf/a");
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toEqual(ok(503));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("never retries writes", async () => {
    mockFetch.mockResolvedValue(ok(503));
    await jellyfinFetch("http://jf/a", { method: "POST" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("redactUrl", () => {
  it("hides keys and tokens", () => {
    expect(redactUrl("http://jf/x?a=1&api_key=abc&ApiKey=d&token=e")).toBe(
      "http://jf/x?a=1&api_key=***&ApiKey=***&token=***"
    );
  });
});
