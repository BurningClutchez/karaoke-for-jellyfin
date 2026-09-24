import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  clientSource,
  reportClientError,
  resetClientLog,
  shouldSend,
} from "@/lib/clientLog";

describe("clientLog", () => {
  beforeEach(() => {
    resetClientLog();
    vi.restoreAllMocks();
  });

  it("names the page a report comes from", () => {
    expect(clientSource("/tv")).toBe("tv");
    expect(clientSource("/admin")).toBe("admin");
    expect(clientSource("/")).toBe("mobile");
  });

  it("drops repeats within a minute and caps the rate", () => {
    expect(shouldSend("a", 0)).toBe(true);
    expect(shouldSend("a", 1000)).toBe(false);
    for (let i = 0; i < 9; i++) expect(shouldSend(`m${i}`, 2000)).toBe(true);
    expect(shouldSend("over", 3000)).toBe(false);
    expect(shouldSend("a", 70000)).toBe(true);
  });

  it("prefers sendBeacon", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    reportClientError("error", "boom", "stack");
    expect(beacon).toHaveBeenCalledWith(
      "/api/client-log",
      expect.stringContaining('"message":"boom"')
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to fetch, and never throws", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
    });
    const fetchSpy = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchSpy);
    expect(() => reportClientError("warn", "slow")).not.toThrow();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/client-log",
      expect.objectContaining({ method: "POST", keepalive: true })
    );
    vi.stubGlobal("fetch", () => {
      throw new Error("sync");
    });
    expect(() => reportClientError("warn", "again")).not.toThrow();
  });
});
