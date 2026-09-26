#!/usr/bin/env node
/**
 * Checks the Karaoke CDG plugin against a running Jellyfin set up by
 * setup-jellyfin.sh (reads JELLYFIN_SERVER_URL and JELLYFIN_API_KEY from the
 * environment or .env.local). Exits non-zero on the first failed check.
 */
const fs = require("fs");

function loadEnv(file = ".env.local") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadEnv();
const URL_BASE = (process.env.JELLYFIN_SERVER_URL || "").replace(/\/$/, "");
const API_KEY = process.env.JELLYFIN_API_KEY || "";
const PLUGIN_ID = "1cb1fb711f2b46c885443491558b01ec";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(method, path, { body, token = API_KEY, raw } = {}) {
  const response = await fetch(URL_BASE + path, {
    method,
    headers: {
      Authorization: `MediaBrowser Client="Karaoke CI", Device="ci", DeviceId="karaoke-ci-checks", Version="1.0", Token="${token}"`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return response;
  if (!response.ok)
    throw new Error(`${method} ${path}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function findSong(term) {
  const items = await api(
    "GET",
    `/Items?Recursive=true&IncludeItemTypes=Audio&SearchTerm=${encodeURIComponent(term)}`
  );
  return items.Items[0];
}

async function waitForRender(predicate, timeoutMs) {
  const started = Date.now();
  let status;
  while (Date.now() - started < timeoutMs) {
    status = await api("GET", "/Karaoke/Render/Status");
    if (predicate(status)) return status;
    await sleep(1000);
  }
  throw new Error(`Render status never matched: ${JSON.stringify(status)}`);
}

async function setConfig(changes) {
  const config = await api("GET", `/Plugins/${PLUGIN_ID}/Configuration`);
  await api("POST", `/Plugins/${PLUGIN_ID}/Configuration`, {
    body: { ...config, ...changes },
  });
  return config;
}

async function runTask(key) {
  const tasks = await api("GET", "/ScheduledTasks");
  const task = tasks.find(t => t.Key === key);
  await api("POST", `/ScheduledTasks/Running/${task.Id}`);
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const state = await api("GET", `/ScheduledTasks/${task.Id}`);
    if (state.State === "Idle" && state.LastExecutionResult) return state;
  }
  throw new Error(`Task ${key} did not finish`);
}

async function main() {
  console.log("Plugin status and song list");
  const status = await api("GET", "/Karaoke/Status");
  check(status.FfmpegFound, "ffmpeg found");
  check(
    status.Placeholders >= 1,
    `zip placeholders made (${status.Placeholders})`
  );
  check(status.SettingsWarnings.length === 0, "no settings warnings");

  const graphicsSong = await findSong("Graphics Song");
  const zipSong = await findSong("Zipped Song");
  const lyricSong = await findSong("Bohemian");
  const { ItemIds } = await api("GET", "/Karaoke/Songs");
  check(
    ItemIds.includes(graphicsSong.Id),
    "/Karaoke/Songs lists the .cdg song"
  );
  check(ItemIds.includes(zipSong.Id), "/Karaoke/Songs lists the zipped song");
  check(
    !ItemIds.includes(lyricSong.Id),
    "/Karaoke/Songs leaves out songs without graphics"
  );

  console.log("Render task visibility and access");
  const visible = await api("GET", "/ScheduledTasks?isHidden=false");
  check(
    !visible.some(t => t.Key === "KaraokeCdgRenderVideos"),
    "render task hidden from Scheduled Tasks"
  );
  await api("POST", "/Users/New", {
    body: { Name: "ci-guest", Password: "guest" },
  });
  const guest = await api("POST", "/Users/AuthenticateByName", {
    body: { Username: "ci-guest", Pw: "guest" },
  });
  const guestEstimate = await api("GET", "/Karaoke/Render/Estimate", {
    token: guest.AccessToken,
    raw: true,
  });
  check(
    guestEstimate.status === 403,
    "non-admins can't estimate or start renders"
  );
  await api("DELETE", `/Users/${guest.User.Id}`);

  console.log("Render estimate, start, cancel and complete");
  const estimate = await api("GET", "/Karaoke/Render/Estimate");
  check(
    estimate.TotalSongs === 2 && estimate.SongsToRender === 2,
    `2 songs to render (${estimate.SongsToRender} of ${estimate.TotalSongs})`
  );
  check(
    estimate.Seconds > 0 && estimate.Bytes > 0,
    `estimate ${estimate.Seconds.toFixed(1)} s, ${estimate.Bytes} bytes`
  );
  check(
    estimate.TemporaryBytes > 0 && estimate.FreeBytes > 0,
    "temporary and free space reported"
  );

  const started = await api("POST", "/Karaoke/Render/Start");
  check(started.State === "Running", "Start reports the task running");
  await api("POST", "/Karaoke/Render/Cancel");
  const cancelled = await waitForRender(s => s.State === "Idle", 30_000);
  check(cancelled.LastResult === "Cancelled", "Cancel stops the task");

  await api("POST", "/Karaoke/Render/Start");
  const progress = [];
  const done = await waitForRender(s => {
    if (s.Progress != null) progress.push(s.Progress);
    return s.State === "Idle";
  }, 300_000);
  check(
    done.LastResult === "Completed",
    `render completed (progress seen: ${progress.map(p => Math.round(p)).join(", ") || "none"})`
  );
  const after = await api("GET", "/Karaoke/Render/Estimate");
  check(after.SongsToRender === 0, "nothing left to render");

  console.log(
    "Zipped song's TV video is served from the cache without extracting"
  );
  const original = await setConfig({
    ExtractRetentionHours: 0,
    KeepRecentCount: 0,
  });
  try {
    const first = await api("GET", `/Karaoke/Video/${zipSong.Id}`, {
      raw: true,
    });
    check(first.ok, "TV video rendered");
    await runTask("KaraokeCdgCleanupExtracted");
    check(
      (await api("GET", "/Karaoke/Status")).ExtractedSongs === 0,
      "cleanup removed the extracted zip"
    );
    const second = await api("GET", `/Karaoke/Video/${zipSong.Id}`, {
      raw: true,
    });
    check(second.ok, "TV video served again");
    check(
      (await api("GET", "/Karaoke/Status")).ExtractedSongs === 0,
      "zip was not extracted again"
    );
  } finally {
    await setConfig({
      ExtractRetentionHours: original.ExtractRetentionHours,
      KeepRecentCount: original.KeepRecentCount,
    });
  }

  console.log("All plugin checks passed");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
