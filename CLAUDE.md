# Karaoke for Jellyfin

A karaoke app that streams music from a Jellyfin media server. Two interfaces: a mobile web UI for singers to browse/queue songs, and a TV display that shows lyrics, playback progress, and song transitions.

## Architecture

- **Next.js 16** (App Router, Turbopack) + **custom Node server** (`server.js`) for WebSocket support via Socket.IO
- `npm run dev` / `npm start` both run `server.js`, which boots Next.js internally and attaches Socket.IO
- The TV display (`/tv`) connects as a special "tv" client via WebSocket; mobile clients connect on join
- Queue state lives in-memory on the server (no database) — managed by `src/services/session.ts`

## Key Paths

| Area                                     | Path                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Custom server (WebSocket + queue logic)  | `server.js` (1100 lines — the "backend")                                    |
| API routes (REST for queue, songs, etc.) | `src/app/api/`                                                              |
| TV display page                          | `src/app/tv/page.tsx`                                                       |
| Mobile entry page                        | `src/app/page.tsx`                                                          |
| TV components                            | `src/components/tv/`                                                        |
| Mobile components                        | `src/components/mobile/`                                                    |
| Hooks                                    | `src/hooks/`                                                                |
| Services (Jellyfin SDK, lyrics, search)  | `src/services/`                                                             |
| Shared types                             | `src/types/index.ts`                                                        |
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

## Error handling and logging

- `server/logger.js` wraps console for the whole process: levels (`LOG_LEVEL`), JSON (`LOG_FORMAT=json`), secret masking, one debug line per API request. Use `console.debug` for chatty detail.
- Socket handlers are wrapped by `server/socket-guard.js` (payload validation, errors reported to the client, never crash the server). Add a validator there for new events, and a per-minute limit in `RATE_LIMITS` for user-driven ones.
- `server.js` sets `x-karaoke-client-address` on every request (`server/client-address.js`; X-Forwarded-For only with `TRUST_PROXY=true`). API routes use it for per-client limits, never X-Forwarded-For.
- Call Jellyfin with `jellyfinFetch` and `mediaBrowserToken` from `src/lib/jellyfinFetch.ts` (timeout, one retry for reads, standard auth header). Never use `X-Emby-Token` or `api_key`: Jellyfin 12 rejects them by default.
- Browser errors go to the server log through `reportClientError` (`src/lib/clientLog.ts`) and `/api/client-log`; error boundaries are `src/app/error.tsx`, `global-error.tsx` and `tv/error.tsx` (self-recovering).

## Testing

### Unit Tests

- Vitest + @testing-library/react + jsdom
- Coverage thresholds: 60% branches, 65% functions/lines/statements
- Config: `vitest.config.ts`
- Tests live in `__tests__/` mirroring `src/` structure

### E2E / Acceptance Tests

- **Playwright + playwright-bdd** (Gherkin `.feature` files)
- Projects in `playwright.config.ts` (CI runs all of them):
  - `single-user` — headless, one browser context
  - `multi-user`, `audience-reactions`, `admin-sync`, `fair-rotation` — headless, multiple isolated contexts (Alice, Bob, TV)
  - `favorites-history` — headless, runs serially
  - `cdg-graphics` — a phone picks CD+G songs (sidecar and zipped) and the TV must draw the graphics
  - `full-playback` — **headed** via xvfb in CI, uses real audio decoding
- Before running: `npx bddgen` regenerates `.features-gen/` from features + steps
- E2E tests hit a **real Jellyfin server** (not mocked): in CI, the one `scripts/ci` sets up. Locally, any Jellyfin with that library works — timeouts must account for network latency

### CI

- GitHub Actions: `.github/workflows/ci.yml`
- Runs on PRs and pushes to main
- Steps: lint → format → unit tests → CRAP → build → plugin build → Jellyfin in Docker → plugin checks → all Playwright projects (under xvfb)
- CI runs its own Jellyfin (`jellyfin/jellyfin:12.1`) with the Karaoke CDG plugin from the commit, so no secrets are needed:
  - `scripts/ci/make-library.sh` builds the test library: lyric songs under artists A–T (tests pick artists by position), a `.cdg` song, a zipped song and a song with neither under "Zz …" artists
  - `scripts/ci/setup-jellyfin.sh` runs the startup wizard, adds the library, waits for the zip placeholders, creates an API key and a playlist, and writes `.env.local`
  - `scripts/ci/plugin-checks.js` checks `/Karaoke/Songs`, the render estimate/start/cancel/progress, admin-only access and the video cache
- On failure, the Playwright report, test results and Jellyfin's log are uploaded as the `test-results` artifact
- Docker image (`.github/workflows/docker-publish.yml`): built on PRs and pushes to main; published only on main/tag pushes when the `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets are set, as `vars.DOCKER_IMAGE` (default `mrorbitman/karaoke-for-jellyfin`)
- Concurrency group cancels stale runs on new pushes

## TV Display Transition Flow

The TV cycles through display states managed by `TransitionState`:

```
waiting → playing → applause (rating animation) → next-up (splash) → playing (next song)
                                                 → waiting (if queue empty)
```

- `applause` state shows `RatingAnimation` with letter grade + "Up Next" info
- `next-up` state shows `NextSongSplash` before starting next song
- Song ratings are randomly generated server-side (`server.js` / `lib/ratingGenerator.ts`)

## WebSocket Events (server.js)

Key socket events: `join-session`, `add-song`, `remove-song`, `playback-control`, `skip-song`, `song-ended`, `start-next-song`

## Queue API (REST)

- `GET /api/queue` — read-only view of the live queue in `server.js`: `{success, data: {queue, currentSong, playbackState, session}}` (404 before anyone joins)
- `POST` / `PUT` / `DELETE /api/queue` — return 410. Change the queue over Socket.IO (`add-song`, `remove-song`, `skip-song`)
- The old REST session store (`src/services/session/`), its handlers (`src/app/api/queue/handlers/`) and `src/lib/websocket/` are commented out, kept for reference. They never shared state with the socket queue

## E2E Testing Patterns

### Multi-user tests

- Use `clearQueue()` from `e2e/steps/queue-cleanup.ts` at the start of each scenario to prevent state bleed between tests (it removes songs over Socket.IO)
- Song additions use artist-item → add-song-button pattern (not search queries)
- `ConfirmationDialog` has a 2s auto-close but tests dismiss it explicitly via close button
- Song transitions in headless use `skipCurrentSong()` (a `skip-song` socket event) — audio `ended` events don't fire reliably in headless Chromium
- Queue assertions use `.or()` pattern: `queueItem.or(nowPlaying)` since first song auto-plays

### Full-playback tests (headed)

- Real audio playback with `--autoplay-policy=no-user-gesture-required`
- To avoid 3+ minute waits, seeks to 5s before end, then waits for natural `audio.ended`
- Next-song splash assertion uses `.or(lyrics)` to handle race where server advances before client captures nextSong
- `xvfb-run` provides the virtual display in CI

### Timeouts

- Remote Jellyfin API calls need 15s+ timeouts in CI (default 5s is too short)
- TV display transitions: 30s for lyrics/countdown to appear
- Full song playback: 60s for `audio.ended` after seeking

## Pre-commit Hooks

Husky + lint-staged runs: prettier → vitest → next build. All must pass before commit.
