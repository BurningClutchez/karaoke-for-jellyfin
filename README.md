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
      # - JELLYFIN_MUSIC_LIBRARY=Music   # list artists from this library only
      # - CDG_MODE=auto                  # auto | canvas | video | off (docs/CDG.md)
      # - CDG_PRERENDER=false            # don't render videos for queued songs
      # - SONG_FILTER=karaoke           # karaoke (lyrics or CD+G) | lyrics | all
      # - LOG_LEVEL=info                 # debug | info | warn | error
      # - TRUST_PROXY=true               # behind a reverse proxy (per-client limits)
      # - PLAYBACK_STALL_ACTION=skip     # skip songs the TV gets stuck on (default: notify)
    restart: unless-stopped
```

Then open:

- `http://<host>:3967/tv` on the TV
- `http://<host>:3967/` on phones (or scan the QR code on the TV)
- `http://<host>:3967/admin` for the host

More settings, such as TV timings, are in [`.env.example`](.env.example); playlist filtering is in [`.env.local.example`](.env.local.example). For CD+G graphics, add the [Jellyfin plugin](jellyfin-plugin/README.md) or mount your music folder (see [docs/CDG.md](docs/CDG.md)).

## Only karaoke songs on phones

Keep karaoke files apart from your regular music, and give the app a Jellyfin user that can only see them.

1. **Separate folder and library.** Put karaoke files in their own folder, mount it into Jellyfin (for example at `/media/karaoke`), and add it as its own library of type Music, such as "Karaoke Tracks". Regular music stays in "Music".
2. **A karaoke-only Jellyfin user.** In **Dashboard → Users**, add a user such as `karaoke`. Under **Library access**, untick "Enable access to all libraries" and tick only **Karaoke Tracks**, plus the plugin's **Karaoke** library if you have zipped songs (their placeholders live there). Set `JELLYFIN_USERNAME=karaoke`. Every query the app makes is limited to what this user can see, so regular music doesn't show up in browsing, title search or song lists.
3. **Plugin zip folders.** In **Dashboard → Plugins → Karaoke CDG**, set **Zip folders** to `/media/karaoke`. The default searches every music library.
4. **App mount, only for CD+G option A.** With the plugin, the app needs no music mount. Otherwise mount just the karaoke folder, for example `/path/to/karaoke:/karaoke:ro` with `CDG_LOCAL_ROOT=/karaoke` and `CDG_JELLYFIN_ROOT=/media/karaoke`. The app never reads outside `CDG_JELLYFIN_ROOT`. If your karaoke files are a subfolder of the music library, use that subfolder, such as `CDG_JELLYFIN_ROOT=/media/music/Karaoke`.
5. **Keep `SONG_FILTER=karaoke`** (the default) so phones only list songs with lyrics or CD+G graphics. On its own it isn't enough: regular songs with lyrics would still show, which is why step 2 matters.

`JELLYFIN_MUSIC_LIBRARY` isn't a substitute for step 2: it only narrows the artist list, not title search or song lists, and it takes one library, so it can't include both your karaoke library and the plugin's Karaoke library.

**What needs a restart**

| Change                                          | What to do                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| New mount on Jellyfin                           | `docker compose up -d jellyfin`, then add the library and scan   |
| `JELLYFIN_USERNAME`, `CDG_*` or the app's mount | `docker compose up -d karaoke`                                   |
| A new library while the app runs                | `docker compose up -d karaoke` (it picks its library at startup) |
| The user's library access                       | Nothing: applies to the next search                              |
| The plugin's zip folders                        | Nothing: run a library scan to make placeholders now             |
| Which songs are badged Karaoke                  | Nothing: updates within about 15 minutes                         |

Use `docker compose up -d`, not `restart`, which keeps the old settings. Recreating the app empties the queue, so do it before the party; phones reconnect by themselves. Do the steps in the order above, then search on a phone for a title that's only in your regular music: it shouldn't appear.

## Jellyfin, Tailscale and the app on one IP

[`docs/docker-compose.tailscale-macvlan.yml`](docs/docker-compose.tailscale-macvlan.yml) runs Jellyfin and the app behind a Tailscale container that has its own LAN IP (macvlan). Both share its networking, so they answer on one LAN IP and one tailnet IP. Karaoke files are already separated as in the section above.

1. Replace `192.168.1.60`, the subnet, the gateway and `eth0` with your own; pick an IP outside your router's DHCP range.
2. Put `TS_AUTHKEY`, `JELLYFIN_API_KEY` and `JELLYFIN_USERNAME` in a `.env` file next to it. Create the API key once Jellyfin is up, then run `docker compose up -d karaoke` again.
3. In the Tailscale admin console, approve the `192.168.1.60/32` route. Tailnet devices can then use the LAN addresses too, which album art needs (it loads straight from `JELLYFIN_SERVER_URL`). Phones use approved routes automatically; Linux needs `--accept-routes`.
4. Open the TV at `http://192.168.1.60:3000/tv`. The QR code shows the address the TV page was opened on, so opening it at the LAN IP gives guests a code that works on Wi-Fi and, with the route, over Tailscale.

| Where                     | Phones                     | TV                            | Jellyfin                   |
| ------------------------- | -------------------------- | ----------------------------- | -------------------------- |
| Home Wi-Fi                | `http://192.168.1.60:3000` | `http://192.168.1.60:3000/tv` | `http://192.168.1.60:8096` |
| Tailscale, route approved | the same                   | the same                      | the same                   |
| Tailscale, no route       | `http://karaoke:3000`      | `http://karaoke:3000/tv`      | `http://karaoke:8096`      |

- The Docker host can't reach its own macvlan IP; other LAN devices can. Add a macvlan shim on the host, or use the tailnet name, to reach it from the host.
- Restarting the Tailscale container cuts off the other two. `depends_on … restart: true` restarts them too (Docker Compose 2.17+); otherwise run `docker compose restart jellyfin karaoke`.
- All three share one IP, so ports must differ: the app uses 3000, Jellyfin 8096.
- Leave `TRUST_PROXY` off: phones connect directly, not through a proxy.

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
- If a song is playing but the TV reports no progress for 60 seconds (stuck buffering, a hung or sleeping TV, blocked autoplay), the log gets a warning and phones see "The TV seems stuck". `PLAYBACK_STALL_SECONDS` changes the wait (0 turns it off); `PLAYBACK_STALL_ACTION=skip` also skips the song.
- Each phone can only send so many song adds, removals, skips and reactions a minute; extra ones get a "Too many requests" message and one warning is logged. Behind a reverse proxy, set `TRUST_PROXY=true` so browser error reports are limited per phone instead of per proxy.
- Works with Jellyfin 12: the app uses the standard `Authorization: MediaBrowser Token` header.

## Troubleshooting

- **Lyrics too early or late:** use the lyrics offset in the admin page.
- **Old version showing:** use the cache panel in the admin page, visit `/clear-cache`, or force-refresh the browser.
- **TV shows "Press OK or tap the screen to turn on sound":** the TV's browser won't play sound until someone interacts with the page. Press OK on the remote (or any key, or tap) once after opening `/tv`. The log shows `[client:tv] The browser blocked sound` when this happens. Allowing autoplay for the site in the browser's settings avoids it.
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
