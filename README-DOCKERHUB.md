# Karaoke For Jellyfin

A karaoke party for your Jellyfin music: guests queue songs from their phones, and the TV shows synced lyrics or CD+G karaoke graphics. It can also play the whole party as a Live TV channel in every Jellyfin app.

**Setup guide, with screenshots:** [HOWTO.md](https://github.com/BurningClutchez/karaoke-for-jellyfin/blob/main/HOWTO.md) (preparing songs, the Jellyfin user and API key, the optional Karaoke CDG plugin, the Karaoke Party channel, Tailscale, every setting, troubleshooting).

## Quick start

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

Then open `http://<host>:3967/tv` on the TV, scan its QR code with a phone, and host from `http://<host>:3967/admin`.

## Features

- Phones search by artist, playlist or title and queue songs; songs rotate fairly between singers
- The TV shows synced lyrics, CD+G graphics (with the optional Karaoke CDG plugin: zipped songs and video fallback too), ratings and reactions
- **Karaoke Party channel** (`LIVE_CHANNEL=true`): the party as Live TV in any Jellyfin app; ffmpeg is included
- `linux/amd64` and `linux/arm64`; runs as a non-root user; health check at `/api/health`

## Tags

- `latest`: the `main` branch
- `0.2.0`, `0.2`: releases

## Source

[github.com/BurningClutchez/karaoke-for-jellyfin](https://github.com/BurningClutchez/karaoke-for-jellyfin): source, issues, the Karaoke CDG plugin and the [settings reference](https://github.com/BurningClutchez/karaoke-for-jellyfin/blob/main/HOWTO.md#10-app-settings-reference).
