import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/clientLog", () => ({ reportClientError: vi.fn() }));

import { reportClientError } from "@/lib/clientLog";
import { handlePlayError } from "@/hooks/playError";

const named = (name: string, message = "msg") =>
  Object.assign(new Error(message), { name });

describe("handlePlayError", () => {
  beforeEach(() => {
    vi.mocked(reportClientError).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("leaves blocked autoplay to the sound prompt", () => {
    const setError = vi.fn();
    handlePlayError(named("NotAllowedError"), "Song", setError);
    expect(setError).not.toHaveBeenCalled();
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("ignores a play() interrupted by the next song", () => {
    const setError = vi.fn();
    handlePlayError(named("AbortError"), "Song", setError);
    expect(setError).not.toHaveBeenCalled();
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("shows and reports other failures", () => {
    const setError = vi.fn();
    handlePlayError(named("NotSupportedError", "no source"), "Gone", setError);
    expect(setError).toHaveBeenCalledWith("Play failed: no source");
    expect(reportClientError).toHaveBeenCalledWith(
      "error",
      'Couldn\'t play "Gone": NotSupportedError: no source'
    );
    handlePlayError("odd", undefined, setError);
    expect(reportClientError).toHaveBeenLastCalledWith(
      "error",
      'Couldn\'t play "a song": Error: odd'
    );
  });
});
