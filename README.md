# Karaoke For Jellyfin

[![Docker Build](https://github.com/your-username/karaoke-for-jellyfin/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/your-username/karaoke-for-jellyfin/actions/workflows/docker-publish.yml)
[![Docker Hub](https://img.shields.io/docker/pulls/mrorbitman/karaoke-for-jellyfin)](https://hub.docker.com/r/mrorbitman/karaoke-for-jellyfin)

A web-based karaoke system that integrates with Jellyfin media server to provide karaoke functionality.

The system has three main interfaces:

1. **Mobile Interface** (`<hostname>/`): Search and queue songs from your phone
2. **TV Display** (`<hostname>/tv`): Full-screen karaoke experience for the big screen
3. **Admin Interface** (`<hostname>/admin`): Host controls for managing playback and the karaoke session

### Mobile Interface

Use your phone to search and queue songs while others sing along on the TV.

| Search & Browse                                                             | Add Songs                                                            | Manage Queue                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ![Mobile Search](./screenshots/mobile-1-search-artists-playlists-songs.png) | ![Add Song](./screenshots/mobile-2-add-song-to-queue.png)            | ![Queue Management](./screenshots/mobile-3-manage-queue.png)         |
| Search by artist, playlist, or song title with real-time results            | Add songs to the queue with server confirmation and loading feedback | View and manage the current queue with drag-to-reorder functionality |

### TV Display

Full-screen karaoke experience with lyrics, performance feedback, and queue management.

| Auto-Play & Controls                                            | Sing-Along Lyrics                                           | Performance Rating                                                               | Next Song Countdown                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ![TV Autoplay](./screenshots/tv-1-autoplay-when-song-added.png) | ![TV Lyrics](./screenshots/tv-2-sing-along-with-lyrics.png) | ![TV Rating](./screenshots/tv-3-graded-singing-performance.png)                  | ![TV Next Up](./screenshots/tv-4-next-up-countdown.png)       |
| Automatic playback when songs are added with host controls      | Full-screen lyrics display with real-time synchronization   | Performance ratings and feedback after each song. (These are just random. Shhh!) | Smooth transitions with next song preview and countdown timer |

### Admin Interface

`<hostname>/admin` gives the host playback controls (play, pause, skip, seek, volume, lyrics timing), a view of the queue, emergency stop, and system and cache status. Everything syncs to the TV instantly.

## Features

- Search by artist, playlist or title, and queue songs from any phone
- Full-screen TV display with synced lyrics, song ratings and a next-up countdown
- **CD+G karaoke graphics** for `.cdg` files next to your songs, or zipped with them ([setup](docs/CDG.md))
- **Karaoke channel** in Jellyfin's own apps, via the optional [Jellyfin plugin](jellyfin-plugin/README.md)
- Installable as a web app (PWA)

## Quick start (Docker)

```yaml
services:
  karaoke:
    image: mrorbitman/karaoke-for-jellyfin:latest
    ports:
      - 3967:3000
    environment:
      - JELLYFIN_SERVER_URL=http://192.168.1.50:8096 # must also work from phones (album art)
      - JELLYFIN_API_KEY=your-api-key # Dashboard → API Keys
      - JELLYFIN_USERNAME=your-user
      # Optional
      # - JELLYFIN_MUSIC_LIBRARY=Music   # browse only this library
      # - CDG_MODE=auto                  # auto | canvas | video | off (docs/CDG.md)
      # - CDG_PRERENDER=false            # don't render videos for queued songs
      # - SONG_FILTER=karaoke           # karaoke (lyrics or CD+G) | lyrics | all
      # - LOG_LEVEL=info                 # debug | info | warn | error
    restart: unless-stopped
```

Then open:

- `http://<host>:3967/tv` on the TV
- `http://<host>:3967/` on phones (or scan the QR code on the TV)
- `http://<host>:3967/admin` for the host

More settings, such as TV timings, are in [`.env.example`](.env.example); playlist filtering is in [`.env.local.example`](.env.local.example). For CD+G graphics, add the [Jellyfin plugin](jellyfin-plugin/README.md) or mount your music folder (see [docs/CDG.md](docs/CDG.md)).

## CD+G graphics in short

- The TV draws `.cdg` graphics itself when it can, and falls back to a video rendered by the Jellyfin plugin, then to lyrics.
- Phones list songs that have lyrics or CD+G graphics, both badged **Karaoke**. Set `SONG_FILTER=lyrics` to list only songs with lyrics, or `SONG_FILTER=all` to list every song.
- Queued songs are rendered ahead by default, so the video is ready by the time the song comes up. Set `CDG_PRERENDER=false` to turn this off.
- To render the **whole library** ahead of time, open **Dashboard → Plugins → Karaoke CDG** in Jellyfin and click **Render karaoke videos**. It first calculates how long this will take and how much space it needs, and asks you to confirm.
- Rendered videos are cached like extracted zips. A video that isn't played for 30 days is deleted, except the 100 most recently played, and is rendered again when next needed. Both limits can be changed on the plugin's settings page.

## Checking the setup

- `npm run check:jellyfin` (or `docker compose exec karaoke npm run check:jellyfin`) checks that Jellyfin is reachable, the API key works and the user exists.
- `GET /api/health` reports the app, Jellyfin and plugin status. Add `?strict=1` to get a 503 when Jellyfin has problems.
- Logs have timestamps and levels, mask API keys, and include errors from the TV and phones' browsers. `LOG_LEVEL=debug` shows every request; `LOG_FORMAT=json` suits log collectors.
- Works with Jellyfin 12: the app uses the standard `Authorization: MediaBrowser Token` header.

## Troubleshooting

- **Lyrics too early or late:** use the lyrics offset in the admin page.
- **Old version showing:** use the cache panel in the admin page, visit `/clear-cache`, or force-refresh the browser.
- **No album art on phones:** `JELLYFIN_SERVER_URL` must be reachable from the phones, not just from the app.

## Development

Needs Node.js 20 and a Jellyfin server.

```bash
npm install
cp .env.local.example .env.local   # set the three JELLYFIN_ values
npm run dev                        # http://localhost:3000
```

| Command                   | What it does                  |
| ------------------------- | ----------------------------- |
| `npm test`                | Unit tests (Vitest)           |
| `npm run test:acceptance` | End-to-end tests (Playwright) |
| `npm run lint:check`      | ESLint                        |
| `npm run build`           | Production build              |

The server (`server.js`) runs Next.js and Socket.IO together; the queue lives in memory there. See [CLAUDE.md](CLAUDE.md) for the code layout.
