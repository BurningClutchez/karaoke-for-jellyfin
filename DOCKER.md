# Docker image

To run Karaoke for Jellyfin, follow [HOWTO.md](HOWTO.md): it has the compose files (plain, and with Tailscale and macvlan), every setting and troubleshooting. This page is about the image itself: what's in it, building it, and developing with Docker.

## What's in the image

- **`mrorbitman/karaoke-for-jellyfin`** on Docker Hub, for `linux/amd64` and `linux/arm64`. Tags and publishing: [GITHUB-ACTIONS-SETUP.md](GITHUB-ACTIONS-SETUP.md).
- **Node.js 20 on Alpine**, running `server.js` (Next.js and Socket.IO) as the non-root user `nextjs` (UID 1001).
- **Port 3000** inside the container (`PORT`, `HOSTNAME=0.0.0.0`); map it to any host port, for example `3967:3000`.
- **ffmpeg and the DejaVu font**, for the optional Karaoke Party channel (`LIVE_CHANNEL=true`). Its temporary files go to `/tmp/karaoke-live` inside the container.
- **Health check:** `GET /api/health` every 30 seconds. It's a liveness check: it stays healthy while Jellyfin is down, because restarting the app would empty the queue. Monitors can use `/api/health?strict=1`, which answers 503 when Jellyfin has problems.
- **`npm run check:jellyfin`** works inside the container: `docker compose exec karaoke npm run check:jellyfin`.
- **No volumes are required.** Mount your karaoke folder read-only only for CD+G without the plugin (HOWTO, section 4.2).

## Building the image

```bash
docker build -t karaoke-for-jellyfin .
```

For both architectures:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t karaoke-for-jellyfin .
```

## Developing with Docker

Run the dev server in a Node container with your checkout mounted (`.env.local` holds the three `JELLYFIN_` settings):

```bash
docker run -it --rm \
  --name karaoke-dev \
  -p 3000:3000 \
  -v "$(pwd)":/app \
  -v /app/node_modules \
  --env-file .env.local \
  node:20-alpine \
  sh -c "cd /app && npm install && npm run dev"
```

## Logs

```bash
docker compose logs -f karaoke
```

Logs have timestamps and levels and mask API keys. `LOG_LEVEL=debug` shows every request; `LOG_FORMAT=json` writes one JSON object per line for log collectors.
