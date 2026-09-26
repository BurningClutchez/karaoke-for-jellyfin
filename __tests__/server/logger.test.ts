import { describe, it, expect, vi } from "vitest";
import {
  formatLine,
  installLogger,
  logRequest,
  redact,
} from "../../server/logger";

const fixedNow = () => new Date("2026-09-24T12:00:00.000Z");

describe("redact", () => {
  it("hides keys and tokens in URLs, headers and auth values", () => {
    expect(redact("GET /x?api_key=abc123&ApiKey=zz&token=t1")).toBe(
      "GET /x?api_key=***&ApiKey=***&token=***"
    );
    expect(redact('Authorization: MediaBrowser Token="secretvalue"')).toBe(
      'Authorization: MediaBrowser Token="***"'
    );
    expect(redact('{"X-Emby-Token":"abcdef"}')).toBe('{"X-Emby-Token":"***"}');
  });

  it("hides known secrets anywhere, ignoring short ones", () => {
    expect(redact("key is supersecret99 ok", ["supersecret99"])).toBe(
      "key is *** ok"
    );
    expect(redact("ab ab", ["ab"])).toBe("ab ab");
  });
});

describe("formatLine", () => {
  it("adds the time and level", () => {
    expect(
      formatLine("info", ["Queue:", 3], { env: {}, now: fixedNow, secrets: [] })
    ).toBe("2026-09-24T12:00:00.000Z INFO  Queue: 3");
  });

  it("writes JSON when LOG_FORMAT=json", () => {
    const line = formatLine("warn", ["x"], {
      env: { LOG_FORMAT: "json" },
      now: fixedNow,
      secrets: [],
    });
    expect(JSON.parse(line)).toEqual({
      time: "2026-09-24T12:00:00.000Z",
      level: "warn",
      msg: "x",
    });
  });
});

describe("installLogger", () => {
  function fakeConsole() {
    return {
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it("filters by LOG_LEVEL and sends warnings and errors to stderr", () => {
    const target = fakeConsole();
    const out = target.log;
    const err = target.error;
    const restore = installLogger({
      target,
      env: { LOG_LEVEL: "info" },
      now: fixedNow,
    });
    target.debug("hidden");
    target.log("shown");
    target.warn("careful");
    expect(out).toHaveBeenCalledTimes(1);
    expect(out.mock.calls[0][0]).toContain("INFO  shown");
    expect(err.mock.calls[0][0]).toContain("WARN  careful");
    restore();
    expect(target.log).toBe(out);
  });

  it("masks the API key even when it is loaded after the logger", () => {
    const target = fakeConsole();
    const out = target.log;
    const env: Record<string, string> = {};
    installLogger({ target, env, now: fixedNow });
    env.JELLYFIN_API_KEY = "loadedlater123";
    target.info("using loadedlater123");
    expect(out.mock.calls[0][0]).toContain("using ***");
  });

  it("defaults to info for unknown levels", () => {
    const target = fakeConsole();
    const out = target.log;
    installLogger({ target, env: { LOG_LEVEL: "loud" }, now: fixedNow });
    target.debug("hidden");
    target.info("shown");
    expect(out).toHaveBeenCalledTimes(1);
  });
});

describe("logRequest", () => {
  const log = () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() });
  const now = () => 1050;

  it("logs API requests by outcome", () => {
    const logger = log();
    logRequest(
      { method: "GET", url: "/api/songs" },
      { statusCode: 200 },
      1000,
      logger,
      now
    );
    logRequest(
      { method: "GET", url: "/api/x" },
      { statusCode: 404 },
      1000,
      logger,
      now
    );
    logRequest(
      { method: "GET", url: "/api/y" },
      { statusCode: 502 },
      1000,
      logger,
      now
    );
    expect(logger.debug).toHaveBeenCalledWith("[http] GET /api/songs 200 50ms");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("only logs pages and assets when they fail", () => {
    const logger = log();
    logRequest(
      { method: "GET", url: "/_next/x.js" },
      { statusCode: 200 },
      1000,
      logger,
      now
    );
    logRequest(
      { method: "GET", url: "/tv" },
      { statusCode: 500 },
      1000,
      logger,
      now
    );
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
