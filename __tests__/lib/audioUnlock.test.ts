import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/clientLog", () => ({ reportClientError: vi.fn() }));

import { reportClientError } from "@/lib/clientLog";
import {
  isAudioBlocked,
  isAutoplayBlocked,
  playMedia,
  resetAudioUnlock,
  subscribeAudioBlocked,
  unlockAudio,
} from "@/lib/audioUnlock";

const blockedError = () =>
  Object.assign(new Error("user didn't interact"), { name: "NotAllowedError" });

function media(play: () => unknown) {
  return { play: vi.fn(play) } as unknown as HTMLMediaElement & {
    play: ReturnType<typeof vi.fn>;
  };
}

describe("audioUnlock", () => {
  beforeEach(() => {
    resetAudioUnlock();
    vi.mocked(reportClientError).mockClear();
  });

  it("recognises the autoplay error", () => {
    expect(isAutoplayBlocked(blockedError())).toBe(true);
    expect(isAutoplayBlocked(new Error("x"))).toBe(false);
    expect(isAutoplayBlocked(null)).toBe(false);
  });

  it("remembers media the browser refused and reports it once", async () => {
    const listener = vi.fn();
    subscribeAudioBlocked(listener);
    const a = media(() => Promise.reject(blockedError()));
    const b = media(() => Promise.reject(blockedError()));
    await expect(playMedia(a)).rejects.toThrow();
    await expect(playMedia(b)).rejects.toThrow();
    await expect(playMedia(a)).rejects.toThrow();
    expect(isAudioBlocked()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(
      "warn",
      expect.stringContaining("blocked sound")
    );
  });

  it("passes other errors on without blocking", async () => {
    const a = media(() => Promise.reject(new Error("decode")));
    await expect(playMedia(a)).rejects.toThrow("decode");
    expect(isAudioBlocked()).toBe(false);
  });

  it("copes with play() throwing or returning nothing", async () => {
    const throws = media(() => {
      throw blockedError();
    });
    await expect(playMedia(throws)).rejects.toThrow();
    expect(isAudioBlocked()).toBe(true);
    const old = media(() => undefined);
    await expect(playMedia(old)).resolves.toBeUndefined();
  });

  it("starts refused media on unlock and clears once it plays", async () => {
    let allowed = false;
    const a = media(() =>
      allowed ? Promise.resolve() : Promise.reject(blockedError())
    );
    await playMedia(a).catch(() => {});
    unlockAudio(); // still refused
    await Promise.resolve();
    await Promise.resolve();
    expect(isAudioBlocked()).toBe(true);

    allowed = true;
    unlockAudio();
    await vi.waitFor(() => expect(isAudioBlocked()).toBe(false));
    expect(a.play).toHaveBeenCalledTimes(3);
  });

  it("stops notifying after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAudioBlocked(listener);
    unsubscribe();
    await playMedia(media(() => Promise.reject(blockedError()))).catch(
      () => {}
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
