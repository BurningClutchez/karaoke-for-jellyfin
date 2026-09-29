# Changes

What changed in each version of **Karaoke for Jellyfin** (the app, versioned in `package.json`) and the **Karaoke CDG plugin** for Jellyfin (versioned in `jellyfin-plugin/build.yaml`), newest first. Setup and settings are in [HOWTO.md](HOWTO.md).

| App   | Plugin  | Date              |
| ----- | ------- | ----------------- |
| 0.2.0 | 1.0.1.0 | 29 September 2026 |
| 0.1.0 | 1.0.0.0 | 26 September 2026 |
| 0.1.0 | –       | July 2025 onwards |

---

## Karaoke for Jellyfin (the app)

### 0.2.0 (29 September 2026)

Works with plugin 1.0.1.0 (1.0.0.0 works too). All new settings are optional.

**Features**

- **Karaoke Party channel.** With `LIVE_CHANNEL=true` the app plays the party queue as a continuous video stream that Jellyfin shows as a Live TV channel in all its apps (M3U tuner at `/api/live/channel.m3u`, also as HLS). It shows CD+G songs with their graphics, other songs with their lyrics filling in word by word, an "Up next" card with the singer and the join QR code between songs, a "Pick a song!" card when the queue is empty and a "Paused" card while paused. It runs only while someone watches, ends songs by itself, and has `PUBLIC_URL`, `LIVE_NEXT_UP_SECONDS` and `FFMPEG_PATH` settings and a `/api/live/status` endpoint.
- **"Press OK or tap the screen to turn on sound" prompt** on the TV when its browser blocks autoplay. The first key press or tap starts the song and doesn't also pause (Space) or skip (S).
- **Stuck-TV warning.** If a song is playing and the TV reports no progress for 60 seconds, the log gets a warning and the phones are told. `PLAYBACK_STALL_SECONDS` sets the wait (0 turns it off); `PLAYBACK_STALL_ACTION=skip` also skips the song.
- **Per-phone limits** on joins, song adds, removals, skips, reactions and playback-failure reports; extra events get a "Too many requests" message and one warning is logged.
- **`TRUST_PROXY`**: behind a reverse proxy, take the client's address from `X-Forwarded-For`.
- **More TV errors in the server log:** failed plays (with the song title and reason), blocked sound, songs with no stream address, lyrics that fail to load or sync, and socket connection failures.

**Changes**

- The Docker image includes ffmpeg and the DejaVu font (for the Karaoke Party channel).
- Ending a song, skipping and starting the next song are shared functions in `server.js`, used by the TV's socket events and the channel.
- A play interrupted by the next song (`AbortError`) is no longer shown or reported as an error.
- Playwright turns the stuck-TV warning off (`PLAYBACK_STALL_SECONDS=0`), since headless test TVs can't autoplay.
- `JELLYFIN_MUSIC_LIBRARY` is described as what it does: it narrows the artist list only. A Jellyfin user that can only see the karaoke libraries hides regular music everywhere.

**Bug fixes**

- **Reordering the queue works.** Dragging songs in the TV's host controls did nothing: the server ignored `reorder-queue`. It now moves the song among the waiting songs and updates everyone. The admin page's Queue tab gains move up and move down buttons.
- **Songs sat at 0:00 and were skipped when the TV's browser blocked sound.** The refusal was only visible in the TV browser's console; the TV now shows the prompt and the log says so.
- **Browser error reports were rate-limited by `X-Forwarded-For`,** which any client can fake and which is missing without a proxy (so all devices shared one limit). They are now limited per connection address, set by the server.
- **The audio retry after an error ignored blocked sound;** it now waits for the prompt too.

**Documentation**

- New **[HOWTO.md](HOWTO.md)**, the one setup guide, with screenshots from a real Jellyfin 12.1: songs, the Jellyfin library, a karaoke-only user and API key, Option A (app only) and Option B (with the plugin), the Karaoke Party channel, a Tailscale sidecar + macvlan example, users, running a party, every setting, updating and restarts, troubleshooting, and how it was tested.
- README.md is an overview with a short quick start; DOCKER.md is about the image; the Docker Hub README is short; `docs/CDG.md` and the plugin README link to the guide for setup.
- New **CHANGES.md** (this file).

**Upgrading from 0.1.0:** pull the new image and recreate the container (`docker compose up -d karaoke`). Nothing else is required. To use the channel, see HOWTO.md section 6.

**Tested** against a `jellyfin/jellyfin:12.1` container with plugin 1.0.1.0: all 52 acceptance scenarios, the plugin checks, the Karaoke Party channel through Jellyfin's tuner (direct and HLS streams), a restart of Jellyfin and the app, and a 2-hour idle TV and phone that were then used (HOWTO.md section 14). Not tested here: building the Docker image (its package mirror was blocked) and watching the channel in a Jellyfin TV app.

### 0.1.0 (July 2025 to 26 September 2026)

The version number stayed at 0.1.0 during this time, so this section is grouped by period.

#### September 2026: CD+G graphics, zipped songs and reliability

**Features**

- **CD+G karaoke graphics.** Songs with a `.cdg` file next to the audio show their graphics on the TV, drawn in the browser in step with the audio. The app finds the `.cdg` in a read-only mount of the music folder (`CDG_LOCAL_ROOT`, `CDG_JELLYFIN_ROOT`) or through the new Karaoke CDG plugin, and falls back to the plugin's rendered video, then to lyrics. `CDG_MODE=auto|canvas|video|off`.
- **Rendering ahead:** queuing a song asks the plugin to render its video straight away (`CDG_PRERENDER`).
- **Zipped karaoke songs** (one `.cdg` and one audio file per zip), through the plugin: queuing one prepares it, and its real audio is streamed instead of the placeholder.
- **`SONG_FILTER`** chooses what phones list: `karaoke` (songs with lyrics or CD+G graphics, the default), `lyrics`, or `all`. Songs with graphics get the green **Karaoke** badge.
- **Health and checks:** `GET /api/health` (app, Jellyfin and plugin status; `?strict=1` answers 503 when Jellyfin has problems; used by the Docker health check), a startup check of the Jellyfin settings, and `npm run check:jellyfin`.
- **Server logging** with timestamps and levels (`LOG_LEVEL`), JSON output (`LOG_FORMAT=json`), masked API keys and one line per API request.
- **Browser errors in the server log:** uncaught errors, error-boundary errors, audio failures and CD+G problems from the TV and phones, rate-limited.
- **Error boundaries** for the app, the page layout and the TV; the TV recovers by itself.
- **Audio recovery:** on an error, or 15 seconds stuck loading, the TV reloads the song once from where it stopped; if it fails again it reports the song and skips it, and every phone is told why.

**Changes**

- Every Jellyfin request uses the standard `Authorization: MediaBrowser Token="…"` header, and API keys are no longer put in stream URLs. Jellyfin 12 rejects the old `X-Emby-Token` header and `api_key` parameter by default, so the app could not sign in to it before.
- Calls to Jellyfin time out after 15 seconds and read-only calls are retried once after a network error.
- Socket.IO handlers can't crash the server: errors are logged and reported to that client, and the main events' payloads are checked first. Unhandled errors are logged, and the server shuts down cleanly on SIGTERM/SIGINT.
- `GET /api/queue` is a read-only view of the live queue; `POST`/`PUT`/`DELETE` answer 410. The old REST session store, which never shared state with the real queue, is retired.
- CI runs its own Jellyfin 12.1 in Docker with the plugin and a generated test library, so it needs no secrets, and runs every Playwright project (including new CD+G tests).
- The Docker image is built on pull requests too, and published only when Docker Hub secrets are set; the image name is a repository variable.

**Bug fixes**

- Songs with CD+G graphics but no lyrics (every zipped song) never appeared on phones.
- The Docker image copied `server.js` but not the `server/` folder it needs, so the container couldn't start.
- With more than one music library, browsing only used the first one.
- The server synced its queue to port 3000 whatever `PORT` was set to.
- `/api/debug/*` and `/debug/websocket-state` were open in production; they now answer 404 unless `ENABLE_DEBUG_ROUTES=true`.
- The CD+G video restarted from the beginning once it was shorter than the song; it now holds the last frame.

#### June 2026: testing, reactions, fair rotation and favorites

**Features**

- **Audience reactions:** phones send emoji that float across the TV.
- **Fair queue rotation:** songs alternate between singers, so one person can't fill the queue.
- **Favorites and song history** in **My Songs** on phones.
- The rating screen shows the next song.

**Changes**

- Unit tests (Vitest), coverage thresholds, a CRAP score check, and end-to-end tests (Playwright + Gherkin) against a real Jellyfin, including multi-user, admin-sync and headed full-playback suites; CI runs them.
- Source files are limited to 150 lines, and oversized modules were split.
- Slimmer Docker image: production dependencies only.

**Bug fixes**

- Safari couldn't play audio: range responses had the wrong `Content-Length`.
- Browsing artists could fetch in an endless loop.
- The admin page didn't follow playback: time updates weren't broadcast, and joining sent a default state instead of the real one.
- The admin seek slider jittered while dragging.
- The Docker build failed running scripts in the production-dependencies stage.

#### December 2025 to January 2026: security updates

- Next.js and React updated for CVE-2024-46982 and CVE-2025-55182 (remote code execution).
- Node.js 20 in the image, for Next.js 15.5.

#### July to August 2025: first release

- **Phones:** join with a name, search by artist, album, playlist or title (unified search, browsing all artists without a search), add songs, see and manage the queue. `PLAYLIST_FILTER_REGEX` limits which playlists show.
- **TV:** full-screen synced lyrics, autoplay when songs are added, a random rating after each song, a next-up countdown, the join QR code, host controls and keyboard shortcuts.
- **Host page** (`/admin`): play, pause, skip, seek, volume, lyrics timing offset, the queue, emergency controls and system status.
- Installable web app (PWA) with cache clearing (`/clear-cache` and the admin cache panel).
- Android TV app build script (Bubblewrap), Docker image and Docker Compose file.
- Fixes: reconnection after a dropped connection, autoplay, environment variables in Docker.

---

## Karaoke CDG plugin

### 1.0.1.0 (28 September 2026)

**Bug fixes**

- **A zip that couldn't be read lost its placeholder for good.** A read error while inspecting a zip (a network share dropping out, a zip locked while being copied, permissions) deleted its placeholder and recorded the zip as "not karaoke"; later passes skipped it as unchanged, so the song stayed out of search until the zip itself was modified. Now the placeholder and record are kept, the log says `Could not read <zip>; keeping its placeholder and trying again on the next pass`, and the next pass reads it again. Only a zip that was read (a valid non-karaoke zip, or a corrupt one) loses its placeholder.
- **Placeholders lost to that come back by themselves:** zip records now note whether the zip was actually read, and older records without a placeholder are read once more.

**Upgrading from 1.0.0.0:** put the new DLL in a folder named `KaraokeCdg_1.0.1.0`, delete the `KaraokeCdg_1.0.0.0` folder, and restart Jellyfin. The next library scan (or the hourly task) recreates missing placeholders.

### 1.0.0.0 (24 to 26 September 2026): first release

For Jellyfin 12.1.

**Features**

- **CD+G files for Karaoke for Jellyfin:** `GET /Karaoke/Cdg/{itemId}` serves the `.cdg` file next to a song (`.cdg`, `.CDG` or `.Cdg`).
- **Rendered videos:** `GET /Karaoke/Video/{itemId}` renders the graphics with Jellyfin's ffmpeg to a silent H.264 MP4 (or VP9 WebM), cached, with range requests. Identical frames are dropped, so a 4-minute song renders in about 5–7 seconds and the file is small.
- **Karaoke channel** in Jellyfin's own apps: every CD+G song, grouped by artist, plays as a 900×648 H.264 + AAC video with its graphics and audio. Users only see songs from libraries they can access. Videos render on first play (or ahead of time); direct play, seeking and transcoding work.
- **Zipped karaoke songs:** each zip holding one `.cdg` and one audio file gets a placeholder (a silent MP3 of the same length with the song's tags, or the artist and title from the zip name) in its own **Karaoke** library, so zipped songs are searchable. The zip is extracted only when a song is used (`/Karaoke/Prepare`, `/Karaoke/Audio`). Placeholders are made after every library scan, hourly, and optionally about 30 seconds after zips change; deleted zips lose their placeholders, but nothing is removed while a whole zip folder is missing. Zips are read safely (fixed file names, 500 MB entry limit, macOS clutter ignored).
- **Caches** for extracted songs and rendered videos, cleaned hourly: unused for 24 hours / unplayed for 30 days, except the 100 most recently used or played (all configurable).
- **Settings page** (**Dashboard → Plugins → Karaoke CDG**) with every setting and a **Render karaoke videos** button: it estimates the songs, time, storage and temporary space first (from this server's own measurements once it has rendered some), asks for confirmation, shows progress and can be stopped. Admin-only `/Karaoke/Render/{Estimate,Start,Status,Cancel}` endpoints; the task is hidden from Scheduled Tasks.
- `GET /Karaoke/Songs` lists the songs with graphics (so the app can list songs without lyrics), and `GET /Karaoke/Status` reports the version, ffmpeg, placeholder and extraction counts and settings warnings.

**Bug fixes** (found while testing on Jellyfin 12.1 before release)

- A zipped song's cached TV video is served without extracting the zip first.
- **Render** waits until the task is running, so the settings page shows progress straight away.
- Settings page: the Render button hides while rendering, the zip folders box matches Jellyfin's theme and keeps its label, and Cancel no longer looks like Render.
