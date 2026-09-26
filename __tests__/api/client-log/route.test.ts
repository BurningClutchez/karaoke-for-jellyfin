import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, resetClientLogLimits } from "@/app/api/client-log/route";

const post = (body: string, ip = "1.2.3.4") =>
  POST(
    new NextRequest("http://localhost/api/client-log", {
      method: "POST",
      body,
      headers: { "x-forwarded-for": ip },
    })
  );

describe("POST /api/client-log", () => {
  beforeEach(() => {
    resetClientLogLimits();
    vi.restoreAllMocks();
  });

  it("writes browser errors and warnings to the server log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(
      JSON.stringify({
        level: "error",
        message: "boom",
        url: "/tv",
        source: "tv",
        stack: "at x",
      })
    );
    expect(response.status).toBe(204);
    expect(error).toHaveBeenCalledWith("[client:tv] boom (/tv)\nat x");
    await post(JSON.stringify({ level: "warn", message: "slow" }));
    expect(warn).toHaveBeenCalledWith("[client:browser] slow ()");
  });

  it("rejects bad bodies", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ message: 5 }))).status).toBe(400);
  });

  it("clips long text", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await post(JSON.stringify({ message: "x".repeat(5000) }));
    expect(error.mock.calls[0][0].length).toBeLessThan(1100);
  });

  it("rate-limits each client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 30; i++)
      await post(JSON.stringify({ message: `m${i}` }));
    expect((await post(JSON.stringify({ message: "one more" }))).status).toBe(
      429
    );
    expect(
      (await post(JSON.stringify({ message: "other" }), "5.6.7.8")).status
    ).toBe(204);
  });
});
