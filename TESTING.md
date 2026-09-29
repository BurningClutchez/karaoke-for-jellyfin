# Testing

How Karaoke for Jellyfin and the Karaoke CDG plugin are tested: unit tests, end-to-end tests against a real Jellyfin, the plugin checks, and CI. For the release and publishing workflows, see [GITHUB-ACTIONS-SETUP.md](GITHUB-ACTIONS-SETUP.md).

## Commands

| Command                   | What it does                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `npm test`                | Unit tests (Vitest)                                                                   |
| `npm run test:coverage`   | Unit tests with Istanbul coverage (thresholds below)                                  |
| `npm run test:crap`       | CRAP score check (threshold 15) and the 150-line limit for `src/` and `server/` files |
| `npm run test:acceptance` | End-to-end tests: `npx bddgen` then `npx playwright test`                             |
| `npm run lint:check`      | ESLint                                                                                |
| `npm run format:check`    | Prettier                                                                              |
| `npm run check:jellyfin`  | Checks the Jellyfin settings in `.env.local` (reachable, key works, user exists)      |

The pre-commit hook (Husky + lint-staged) runs Prettier, the unit tests and a production build.

## Unit tests

- **Vitest** with `@testing-library/react` and jsdom; config in `vitest.config.ts`.
- Tests live in `__tests__/`, mirroring `src/` (and `server/` in `__tests__/server/`).
- **Coverage thresholds** (for `src/`): 60% branches, 65% functions, lines and statements.
- Server modules take their dependencies as arguments (spawn, fetch, clock, logger) so tests can fake them; the live channel's tests fake ffmpeg.

## End-to-end tests

**Playwright + playwright-bdd**: scenarios are Gherkin `.feature` files in `e2e/features/`, with step definitions in `e2e/steps/`. `npx bddgen` generates `.features-gen/` from them before each run. The tests use a **real Jellyfin server**, not mocks.

**Projects** (`playwright.config.ts`; CI runs all of them):

| Project                                                           | What it covers                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `single-user`                                                     | One browser: joining, search, playlists, queue, admin and playback controls      |
| `multi-user`, `audience-reactions`, `admin-sync`, `fair-rotation` | Several isolated browsers (Alice, Bob, the TV) sharing one queue                 |
| `favorites-history`                                               | My Songs history and favorites (runs serially)                                   |
| `cdg-graphics`                                                    | A phone picks a `.cdg` song and a zipped song, and the TV must draw the graphics |
| `full-playback`                                                   | **Headed** (xvfb in CI) with real audio decoding: whole songs and transitions    |

Playwright starts the app itself (`npm start` in CI, `npm run dev` locally) and sets `PLAYBACK_STALL_SECONDS=0`, because headless test TVs can't autoplay and would look stuck.

### Patterns

- **Clean state:** call `clearQueue()` from `e2e/steps/queue-cleanup.ts` at the start of each multi-user scenario; it removes songs over Socket.IO (the REST queue API is read-only).
- **Adding songs:** open an artist, then press its add-song button, rather than searching.
- **Confirmation dialog:** it closes itself after 2 seconds, but tests close it explicitly.
- **Moving to the next song in headless browsers:** use `skipCurrentSong()` (a `skip-song` socket event); audio `ended` events don't fire reliably in headless Chromium.
- **Queue assertions:** use `queueItem.or(nowPlaying)`, since the first song starts playing straight away.
- **Full playback:** runs Chromium with `--autoplay-policy=no-user-gesture-required`, seeks to 5 seconds before the end, then waits for the real `ended` event. The next-song splash assertion uses `.or(lyrics)`, because the server can move on before the TV shows the splash.
- **Timeouts:** 15 seconds or more for Jellyfin calls, 30 seconds for TV transitions (lyrics or countdown), 60 seconds for `ended` after seeking.

### Running them locally against a Jellyfin in Docker

The same setup CI uses works on any machine with Docker, Node.js 20, the .NET 10 SDK and ffmpeg:

```bash
JF=$HOME/jf-test
dotnet publish jellyfin-plugin/Jellyfin.Plugin.KaraokeCdg -c Release -o jellyfin-plugin/artifacts
scripts/ci/make-library.sh "$JF/music"
mkdir -p "$JF/config/plugins/KaraokeCdg_1.0.1.0" "$JF/cache"
cp jellyfin-plugin/artifacts/Jellyfin.Plugin.KaraokeCdg.dll "$JF/config/plugins/KaraokeCdg_1.0.1.0/"
docker run -d --name jellyfin -p 8096:8096 \
  -v "$JF/config:/config" -v "$JF/cache:/cache" -v "$JF/music:/music:ro" \
  jellyfin/jellyfin:12.1
scripts/ci/setup-jellyfin.sh /music .env.local   # overwrites .env.local
node scripts/ci/plugin-checks.js
npm run build && npx bddgen && CI=1 xvfb-run -a npx playwright test
```

`setup-jellyfin.sh` signs in as `admin` / `karaoke-ci`, so you can open Jellyfin at `http://localhost:8096` too. The plugin checks expect nothing rendered yet: on a second run, empty `$JF/cache/karaoke-cdg` first.

### The test library

`scripts/ci/make-library.sh` builds it with ffmpeg:

- **Lyrics songs** under artists A–T, each with a synced `.lrc` (tests pick artists by their position in the list).
- **"Zz CDG Artist"**: a song with a `.cdg` file next to it (`scripts/ci/make-cdg.js` writes valid CD+G).
- **"Zz Zip Artist"**: a zipped `.cdg` + audio song.
- **"Zz Plain Band"**: a song with neither, which phones must not offer.

## The plugin

The plugin has no unit-test project. `scripts/ci/plugin-checks.js` checks it through a running Jellyfin: the placeholders, `/Karaoke/Songs`, the render estimate, start, cancel and progress through Jellyfin's task manager, admin-only access, the hidden render task, and that a zipped song's cached video is served without extracting the zip.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` (a newer push cancels a running one):

1. Lint, format check, unit tests with coverage, CRAP and file-length check, production build.
2. Builds the plugin and the test library, and starts `jellyfin/jellyfin:12.1` in Docker with that plugin.
3. `scripts/ci/setup-jellyfin.sh`: the startup wizard, the library, waiting for the zip placeholders, an API key, a playlist, and `.env.local`. No secrets are needed.
4. `npm run check:jellyfin`, then the plugin checks.
5. Every Playwright project, under xvfb.

On failure, the Playwright report, the test results and Jellyfin's log are uploaded as the `test-results` artifact.

## Legacy Cypress tests

`cypress/` holds the original Cypress tests. Nothing runs them any more (no npm script, no CI step); the Playwright suites above replaced them.
