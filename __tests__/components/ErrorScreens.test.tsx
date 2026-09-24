import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockReport = vi.fn();
vi.mock("@/lib/clientLog", () => ({
  reportClientError: (...args: unknown[]) => mockReport(...args),
}));

import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import TVError, { TV_RETRY_DELAY_MS, resetTvRecovery } from "@/app/tv/error";

const error = Object.assign(new Error("render failed"), { digest: "d1" });

describe("error screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTvRecovery();
  });
  afterEach(() => vi.useRealTimers());

  it("reports the crash and offers a retry", () => {
    const reset = vi.fn();
    render(<ErrorPage error={error} reset={reset} />);
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "Page crashed: render failed (d1)",
      error.stack
    );
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalled();
  });

  it("renders a full page when the root layout fails", () => {
    render(<GlobalError error={new Error("layout")} />);
    expect(screen.getByText("Reload")).toBeInTheDocument();
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "Page crashed: layout",
      expect.anything()
    );
  });

  it("recovers the TV by itself, reloading after repeated failures", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload },
      configurable: true,
    });
    const reset = vi.fn();
    for (let i = 0; i < 4; i++) {
      const { unmount } = render(<TVError error={error} reset={reset} />);
      vi.advanceTimersByTime(TV_RETRY_DELAY_MS);
      unmount();
    }
    expect(reset).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledTimes(1);
    render(<TVError error={error} reset={reset} />);
    fireEvent.click(screen.getByText("Restart now"));
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("ClientErrorReporter", () => {
  it("reports uncaught errors and rejections until unmounted", () => {
    const { unmount } = render(<ClientErrorReporter />);
    window.dispatchEvent(
      new ErrorEvent("error", { message: "oops", error: new Error("oops") })
    );
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error("nope") });
    window.dispatchEvent(rejection);
    const plain = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(plain, { reason: "text" });
    window.dispatchEvent(plain);
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "oops",
      expect.any(String)
    );
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "Unhandled rejection: nope",
      expect.any(String)
    );
    expect(mockReport).toHaveBeenCalledWith(
      "error",
      "Unhandled rejection: text",
      undefined
    );
    unmount();
    mockReport.mockClear();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(mockReport).not.toHaveBeenCalled();
  });
});
