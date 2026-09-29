# Karaoke for Jellyfin

A karaoke app that streams music from a Jellyfin media server. Two interfaces: a mobile web UI for singers to browse/queue songs, and a TV display that shows lyrics, playback progress, and song transitions.

## Architecture

- **Next.js 16** (App Router, Turbopack) + **custom Node server** (`server.js`) for WebSocket support via Socket.IO
- `npm run dev` / `npm start` both run `server.js`, which boots Next.js internally and attaches Socket.IO
- The TV display (`/tv`) connects as a special "tv" client via WebSocket; mobile clients connect on join
- Queue state lives in memory in `server.js` (no database); a restart empties it

## Key Paths

| Area                                     | Path                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Custom server (WebSocket + queue logic)  | `server.js` (the "backend") and `server/`                                   |
| API routes (REST for queue, songs, etc.) | `src/app/api/`                                                              |
| TV display page                          | `src/app/tv/page.tsx`                                                       |
| Mobile entry page                        | `src/app/page.tsx`                                                          |
| TV components                            | `src/components/tv/`                                                        |
| Mobile components                        | `src/components/mobile/`                                                    |
| Hooks                                    | `src/hooks/`                                                                |
| Services (Jellyfin SDK, lyrics, search)  | `src/services/`                                                             |
| Shared types                             | `src/types/index.ts`                                                        |
| Live TV channel for Jellyfin (ffmpeg)    | `server/live/` — see HOWTO.md section 6                                     |
| CD+G graphics (decoder, lookup, plugin)  | `src/lib/cdg/`, `src/services/cdg/`, `jellyfin-plugin/` — see `docs/CDG.md` |
| E2E features (Gherkin)                   | `e2e/features/`                                                             |
| E2E step definitions                     | `e2e/steps/`                                                                |
| Unit tests                               | `__tests__/`                                                                |

## Environment

Requires `.env.local` with:

```
JELLYFIN_SERVER_URL=<url>
JELLYFIN_API_KEY=<key>
JELLYFIN_USERNAME=<user>
```

## Commands

```bash
npm run dev          # Dev server (custom server.js with HMR via Next.js)
npm run build        # Production build
npm start            # Production server
npm test             # Unit tests (vitest)
npm run test:coverage # Unit tests with Istanbul coverage
npm run test:crap    # CRAP score check (threshold 15)
npm run test:acceptance # Full e2e: bddgen + playwright
npm run lint:check   # ESLint
npm run format:check # Prettier
npm run check:jellyfin # Check the Jellyfin settings (reachable, key, user)
```

## Docs

- The README lists every doc. `HOWTO.md` is the one setup guide (options A and B, Jellyfin user/API key, plugin, Karaoke Party channel, Tailscale example, settings reference, troubleshooting); screenshots in `docs/howto/`. README.md stays an overview that links to it; DOCKER.md covers the image; `docs/CDG.md` and `jellyfin-plugin/README.md` are references. Put setup steps in HOWTO.md only
- A new setting goes in HOWTO.md section 10 and `.env.example`
- Log features, changes and bug fixes in `CHANGES.md` under the app or plugin version they ship in; bump `package.json` / `jellyfin-plugin/build.yaml` (and the `.csproj` and `KaraokeCdg_<version>` folder names) for a release

## Error handling and logging

- `server/logger.js` wraps console for the whole process: levels (`LOG_LEVEL`), JSON (`LOG_FORMAT=json`), secret masking, one debug line per API request. Use `console.debug` for chatty detail.
- Socket handlers are wrapped by `server/socket-guard.js` (payload validation, errors reported to the client, never crash the server). Add a validator there for new events, and a per-minute limit in `RATE_LIMITS` for user-driven ones.
- `server.js` sets `x-karaoke-client-address` on every request (`server/client-address.js`; X-Forwarded-For only with `TRUST_PROXY=true`). API routes use it for per-client limits, never X-Forwarded-For.
- `server/playback-watchdog.js` warns (or skips, `PLAYBACK_STALL_ACTION=skip`) when a song plays with a TV connected but no `time-update` progress for `PLAYBACK_STALL_SECONDS` (60). Playwright sets it to 0: headless TVs can't autoplay.
- Call Jellyfin with `jellyfinFetch` and `mediaBrowserToken` from `src/lib/jellyfinFetch.ts` (timeout, one retry for reads, standard auth header). Never use `X-Emby-Token` or `api_key`: Jellyfin 12 rejects them by default.
- TV audio goes through `playMedia` (`src/lib/audioUnlock.ts`): a play() refused by the autoplay policy shows `EnableSoundPrompt` until a key press or tap. Headless e2e browsers don't enforce the policy, so tests never see it.
- Browser errors go to the server log through `reportClientError` (`src/lib/clientLog.ts`) and `/api/client-log`; error boundaries are `src/app/error.tsx`, `global-error.tsx` and `tv/error.tsx` (self-recovering).

## Testing

Details in [TESTING.md](TESTING.md) (and CI/publishing in [GITHUB-ACTIONS-SETUP.md](GITHUB-ACTIONS-SETUP.md)). The essentials:

- Unit tests: Vitest in `__tests__/` mirroring `src/` and `server/`; coverage thresholds 60% branches, 65% functions/lines/statements; files in `src/` and `server/` max 150 lines (`npm run test:crap`)
- E2E: Playwright + playwright-bdd against a **real Jellyfin** (CI runs `jellyfin/jellyfin:12.1` with the plugin from the commit, set up by `scripts/ci/`); run `npx bddgen` first. Follow the patterns in TESTING.md: `clearQueue()` per scenario, `skipCurrentSong()` in headless, `.or()` queue assertions, generous timeouts
- The plugin has no unit tests; `scripts/ci/plugin-checks.js` checks it through Jellyfin
- `cypress/` is legacy and not run

## Live channel (`server/live/`, `LIVE_CHANNEL=true`)

- Plays the queue as a Jellyfin Live TV channel: `/api/live/channel.m3u` for Jellyfin's M3U tuner, `/api/live/stream.ts` (continuous MPEG-TS) or `stream.m3u8` (HLS). server.js answers `/api/live/*` before Next.js
- One ffmpeg per item (song, "up next", paused or waiting card), in real time, all 1280x720 H.264 + AAC; the HLS muxer cuts segments and `-output_ts_offset` continues the timestamps from the previous item
- Media comes from the app's own API (`/api/stream`, `/api/cdg`, `/api/lyrics`), so zips, the plugin and the local mount work as on the TV page. Lyrics are ASS subtitles with `\kf` word fills
- While watched, the channel is the TV: it calls `completeCurrentSong()` / `startNextSong()` in server.js, and the socket `song-ended` / `start-next-song` events are ignored. It stops 30 s after the last viewer leaves
- Unit tests fake ffmpeg; to see real output, run it with ffmpeg installed and read `/api/live/stream.ts` with `ffmpeg -i … -c copy out.ts`

## Socket events, TV transitions and the queue API

See [WEBSOCKET-EVENT-FLOW.md](WEBSOCKET-EVENT-FLOW.md): every client ↔ server event, a song from start to finish, the TV's `TransitionState` (waiting → playing → applause → next-up), skips, `GET /api/queue` (read-only; writes answer 410) and known gaps (`reorder-queue` has no server handler).

## Pre-commit Hooks

Husky + lint-staged runs: prettier → vitest → next build. All must pass before commit.
