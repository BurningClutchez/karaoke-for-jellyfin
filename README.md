# Karaoke For Jellyfin

[![Docker Build](https://github.com/your-username/karaoke-for-jellyfin/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/your-username/karaoke-for-jellyfin/actions/workflows/docker-publish.yml)
[![Docker Hub](https://img.shields.io/docker/pulls/mrorbitman/karaoke-for-jellyfin)](https://hub.docker.com/r/mrorbitman/karaoke-for-jellyfin)

A web-based karaoke system that integrates with Jellyfin media server to provide karaoke functionality.

**Version 0.2.0** (Karaoke CDG plugin 1.0.1.0). New in this version:

- **Karaoke Party channel**: the party queue as a Live TV channel in every Jellyfin app ([setup](HOWTO.md#6-the-karaoke-party-channel-optional-either-option))
- **"Turn on sound" prompt** on the TV when its browser blocks autoplay, and the TV's audio, lyrics and connection errors in the server log
- **Stuck-TV warning**: a song with no progress on the TV for 60 seconds is reported to the phones, or skipped with `PLAYBACK_STALL_ACTION=skip`
- **Per-phone limits** on song adds, removals, skips and reactions; `TRUST_PROXY` for reverse proxies
- **[HOWTO.md](HOWTO.md)**: one setup guide with screenshots, including [only karaoke songs on phones](HOWTO.md#32-create-a-karaoke-only-user) and [Jellyfin, Tailscale and the app on one IP](HOWTO.md#7-example-jellyfin-tailscale-and-the-app-on-one-ip)
- **Plugin 1.0.1.0**: a zip that can't be read keeps its placeholder, and placeholders lost to that come back

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

- Search by artist, playlist or title, and queue songs from any phone; songs rotate fairly between singers
- Full-screen TV display with synced lyrics, song ratings, reactions and a next-up countdown
- **CD+G karaoke graphics** for `.cdg` files next to your songs, or zipped with them ([how it works](docs/CDG.md))
- **Karaoke channel** in Jellyfin's own apps, via the optional [Karaoke CDG plugin](jellyfin-plugin/README.md)
- **Karaoke Party channel**: the whole party as a Live TV channel in every Jellyfin app, instead of a browser on the TV
- Installable as a web app (PWA), and as an [Android TV app](docs/ANDROID_TV_BUILD.md)

## Setup

**[HOWTO.md](HOWTO.md) is the setup guide**, with screenshots: preparing your songs, the Jellyfin library, user and API key, then either

- **Option A, the app only** (lyrics songs, and CD+G songs from a mounted folder), or
- **Option B, the app and the Karaoke CDG plugin** (adds zipped songs, the Karaoke channel in Jellyfin's apps and rendered videos),

plus the Karaoke Party channel, an example with Tailscale and macvlan, every setting, updating, and troubleshooting.

The shortest start, for songs with lyrics:

```yaml
services:
  karaoke:
    image: mrorbitman/karaoke-for-jellyfin:latest
    ports:
      - 3967:3000
    environment:
      - JELLYFIN_SERVER_URL=http://192.168.1.50:8096 # must also work from phones
      - JELLYFIN_API_KEY=your-api-key # Jellyfin: Dashboard → API Keys
      - JELLYFIN_USERNAME=karaoke # a user that can only see your karaoke library
    restart: unless-stopped
```

Then open `http://<host>:3967/tv` on the TV, scan its QR code with your phone, and use `http://<host>:3967/admin` to host.

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
