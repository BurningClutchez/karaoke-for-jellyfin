import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/clientLog", () => ({ reportClientError: vi.fn() }));

import { EnableSoundPrompt } from "@/components/tv/EnableSoundPrompt";
import { playMedia, resetAudioUnlock } from "@/lib/audioUnlock";

const blockedError = () =>
  Object.assign(new Error("no gesture"), { name: "NotAllowedError" });

describe("EnableSoundPrompt", () => {
  beforeEach(() => resetAudioUnlock());

  it("shows nothing while sound is allowed", () => {
    render(<EnableSoundPrompt />);
    expect(screen.queryByTestId("enable-sound-prompt")).toBeNull();
  });

  it("appears when play is refused and a key press starts the audio", async () => {
    let allowed = false;
    const audio = {
      play: vi.fn(() =>
        allowed ? Promise.resolve() : Promise.reject(blockedError())
      ),
    } as unknown as HTMLMediaElement;
    render(<EnableSoundPrompt />);

    await act(async () => {
      await playMedia(audio).catch(() => {});
    });
    expect(screen.getByTestId("enable-sound-prompt")).toBeTruthy();
    expect(screen.getByText(/Press OK or tap the screen/)).toBeTruthy();

    allowed = true;
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    await act(async () => {
      fireEvent.keyDown(window, { key: " " });
    });
    window.removeEventListener("keydown", shortcut);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(shortcut).not.toHaveBeenCalled(); // Space didn't also pause
    expect(screen.queryByTestId("enable-sound-prompt")).toBeNull();
  });

  it("a tap on the prompt also starts the audio", async () => {
    const play = vi
      .fn()
      .mockRejectedValueOnce(blockedError())
      .mockResolvedValue(undefined);
    render(<EnableSoundPrompt />);
    await act(async () => {
      await playMedia({ play } as unknown as HTMLMediaElement).catch(() => {});
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("enable-sound-prompt"));
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("enable-sound-prompt")).toBeNull();
  });
});
