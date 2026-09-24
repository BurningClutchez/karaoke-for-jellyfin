/**
 * Server logging: routes every console call in the process (server.js,
 * Next.js API routes, services) through one formatter that adds a timestamp
 * and level, filters by LOG_LEVEL and hides secrets.
 *
 *   LOG_LEVEL   debug | info (default) | warn | error
 *   LOG_FORMAT  text (default) | json (one JSON object per line)
 *
 * console.debug is "debug", console.log/info are "info".
 */
const util = require("util");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const METHODS = {
  debug: "debug",
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
};

/** Hide API keys and tokens in log text */
function redact(text, secrets = []) {
  let result = text
    .replace(/(Token=\\?")[^"\\]*(\\?")/g, "$1***$2")
    .replace(/(api_key|apikey|token)=[^&\s"'*][^&\s"']*/gi, "$1=***")
    .replace(/(X-Emby-Token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1***");
  for (const secret of secrets) {
    if (secret && secret.length >= 8) result = result.split(secret).join("***");
  }
  return result;
}

function levelThreshold(env) {
  return LEVELS[(env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;
}

function formatLine(level, args, { env, now, secrets }) {
  const message = redact(util.format(...args), secrets);
  const time = now().toISOString();
  if ((env.LOG_FORMAT || "").toLowerCase() === "json") {
    return JSON.stringify({ time, level, msg: message });
  }
  return `${time} ${level.toUpperCase().padEnd(5)} ${message}`;
}

/** Replace the console methods; returns a function that restores them */
function installLogger({
  target = console,
  env = process.env,
  now = () => new Date(),
} = {}) {
  const originals = {};
  const threshold = levelThreshold(env);
  for (const [method, level] of Object.entries(METHODS)) {
    originals[method] = target[method];
    target[method] = (...args) => {
      if (LEVELS[level] < threshold) return;
      const write = level === "error" || level === "warn" ? "error" : "log";
      originals[write].call(
        target,
        // Read at log time: .env.local is loaded after the logger starts
        formatLine(level, args, { env, now, secrets: [env.JELLYFIN_API_KEY] })
      );
    };
  }
  return () => Object.assign(target, originals);
}

/**
 * One line per finished request: API and debug routes at debug level
 * (warn for 4xx, error for 5xx); pages and assets only when they fail.
 */
function logRequest(req, res, startedAt, log = console, now = Date.now) {
  const status = res.statusCode;
  const isApi = /^\/(api|debug)\//.test(req.url || "");
  if (!isApi && status < 500) return;
  const line = `[http] ${req.method} ${req.url} ${status} ${now() - startedAt}ms`;
  if (status >= 500) log.error(line);
  else if (status >= 400) log.warn(line);
  else log.debug(line);
}

module.exports = { installLogger, redact, formatLine, logRequest };
