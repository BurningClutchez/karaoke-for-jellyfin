#!/usr/bin/env node
/**
 * Preflight: confirms the Jellyfin settings work before slow acceptance tests
 * run. Reads JELLYFIN_SERVER_URL, JELLYFIN_API_KEY and JELLYFIN_USERNAME from
 * the environment or .env.local. Exits 1 with a clear message on the first
 * problem. Usage: npm run check:jellyfin (also run by server.js at startup)
 */
const fs = require("fs");
const path = require("path");

const REQUIRED = [
  "JELLYFIN_SERVER_URL",
  "JELLYFIN_API_KEY",
  "JELLYFIN_USERNAME",
];
const TIMEOUT_MS = 15000;

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .map(line => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(match => [match[1], match[2]])
  );
}

function loadSettings(env, envFile) {
  const fromFile = readEnvFile(envFile);
  return Object.fromEntries(
    REQUIRED.map(name => [name, (env[name] || fromFile[name] || "").trim()])
  );
}

async function request(settings, pathname, fetchImpl) {
  const url = settings.JELLYFIN_SERVER_URL.replace(/\/$/, "") + pathname;
  return fetchImpl(url, {
    headers: {
      Authorization: `MediaBrowser Token="${settings.JELLYFIN_API_KEY}"`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Returns a list of problems (empty when everything works) */
async function check(settings, fetchImpl = fetch) {
  const missing = REQUIRED.filter(name => !settings[name]);
  if (missing.length > 0) {
    return [
      `Missing ${missing.join(", ")}. In CI, add them as repository secrets ` +
        "(Settings > Secrets and variables > Actions); forks don't inherit secrets.",
    ];
  }

  let info;
  try {
    info = await request(settings, "/System/Info", fetchImpl);
  } catch (error) {
    return [
      `Can't reach Jellyfin at ${settings.JELLYFIN_SERVER_URL}: ${error.message}`,
    ];
  }
  if (info.status === 401 || info.status === 403) {
    return [
      `Jellyfin rejected the API key (HTTP ${info.status}). Check JELLYFIN_API_KEY ` +
        "(Dashboard > API Keys).",
    ];
  }
  if (!info.ok)
    return [`Jellyfin returned HTTP ${info.status} for /System/Info`];

  const users = await request(settings, "/Users", fetchImpl);
  const names = users.ok ? (await users.json()).map(user => user.Name) : [];
  const wanted = settings.JELLYFIN_USERNAME.toLowerCase();
  if (!names.some(name => (name || "").toLowerCase() === wanted)) {
    return [
      `Jellyfin user "${settings.JELLYFIN_USERNAME}" not found (users: ${names.join(", ") || "none"})`,
    ];
  }
  return [];
}

async function main() {
  const settings = loadSettings(
    process.env,
    path.resolve(process.cwd(), ".env.local")
  );
  const problems = await check(settings);
  if (problems.length > 0) {
    problems.forEach(problem => console.error(`✗ ${problem}`));
    process.exit(1);
  }
  console.log(
    `✓ Jellyfin at ${settings.JELLYFIN_SERVER_URL} is reachable and accepts the API key`
  );
}

if (require.main === module) main();

module.exports = { check, loadSettings, readEnvFile, main };
