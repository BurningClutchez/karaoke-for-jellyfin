# CD+G Karaoke Graphics

Karaoke for Jellyfin can show the graphics from `.cdg` files, the lyric screens that come with most MP3+G karaoke tracks. Put each `.cdg` file next to its audio file, with the same name:

```
Artist - Song.mp3
Artist - Song.cdg
```

Jellyfin ignores the `.cdg` files during library scans. Karaoke for Jellyfin finds them in one of three ways, and it tries them in this order:

| Order | How the graphics are found and drawn                                                                                             | What you set up                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A     | The app reads the `.cdg` file from its own read-only mount of the music library, and the TV draws it in the browser.             | A volume mount and `CDG_LOCAL_ROOT` |
| B     | The **Karaoke CDG** Jellyfin plugin sends the `.cdg` file, and the TV draws it in the browser.                                   | The plugin                          |
| C     | The plugin renders the graphics to a silent video with Jellyfin's ffmpeg. The TV plays that video in step with the song's audio. | The plugin                          |

Songs without a `.cdg` file show the usual synced lyrics. If graphics can't be loaded, the TV falls back to lyrics too.

When the TV starts a song, it requests `/api/cdg/{itemId}`. The server tries A first, then B. If it gets valid CD+G data, the TV draws it on a canvas that follows the audio clock. In `auto` mode, C is used when the browser can't draw the data (no canvas support, or data that isn't CD+G). C is also used for every song when `CDG_MODE=video`. If C also fails, the TV shows lyrics.

## In Jellyfin's own apps

The Karaoke CDG plugin also adds a **Karaoke** channel to Jellyfin's apps, including the web app, Android, Android TV and iOS. Each song with graphics plays there as an ordinary video, with the graphics and the song's audio together. This doesn't involve Karaoke for Jellyfin at all. See [`jellyfin-plugin/README.md`](../jellyfin-plugin/README.md#karaoke-channel).

## Option A: mount the music library

This needs no Jellyfin changes. The karaoke app must be able to reach the same files Jellyfin uses.

```yaml
services:
  karaoke-app:
    environment:
      # The folder inside this container
      - CDG_LOCAL_ROOT=/music
      # The same folder as Jellyfin reports it (omit if identical)
      - CDG_JELLYFIN_ROOT=/media/music
    volumes:
      - /path/to/music:/music:ro
```

The app asks Jellyfin for the song's path, for example `/media/music/Artist/Song.mp3`, and replaces `CDG_JELLYFIN_ROOT` with `CDG_LOCAL_ROOT`. Then it reads `/music/Artist/Song.cdg`, or the same name with `.CDG`. Paths outside the root are never read. Windows paths from Jellyfin, like `D:\Karaoke\...`, also work: set `CDG_JELLYFIN_ROOT=D:\Karaoke`.

## Options B and C: the Karaoke CDG Jellyfin plugin

Use the plugin when the karaoke app can't mount the library, for example when Jellyfin runs on a NAS. See [`jellyfin-plugin/README.md`](../jellyfin-plugin/README.md) for how to build and install it. It needs no settings in this app, because the app calls it with the existing `JELLYFIN_API_KEY`.

## Display modes

`CDG_MODE` sets how the TV shows graphics:

| Value            | Behaviour                                                                        |
| ---------------- | -------------------------------------------------------------------------------- |
| `auto` (default) | Draw in the browser, and fall back to plugin video (C), then to lyrics           |
| `canvas`         | Draw in the browser only, and fall back to lyrics                                |
| `video`          | Always use plugin video. Useful for weak smart-TV browsers. Falls back to lyrics |
| `off`            | Ignore `.cdg` files                                                              |

## Rendering ahead

With `CDG_MODE=video`, the app asks the plugin to render a song's video as soon as the song is queued, not when its turn comes. Usually at least one song plays in between, so the video is already cached when it's needed. Songs without a `.cdg` file get a quick 404, and nothing is rendered for them.

`CDG_PRERENDER=true` turns this on in the other modes too, and `CDG_PRERENDER=false` turns it off. It's off by default in `auto` mode, because there the video is only a fallback, and rendering every queued song would use Jellyfin's CPU for videos that are rarely played.

Only the H.264 MP4 is rendered ahead. A TV whose browser can't play H.264 asks for WebM, which is still rendered on first play.

## Trade-offs

- **Browser drawing (A and B)** gives sharp pixels, starts instantly, and pauses, seeks and reconnects instantly. The TV downloads the whole `.cdg` file first, about 1.7 MB for a 4-minute song.
- **Plugin video (C)** encodes each song once, on first play or when it is queued (see above). ffmpeg drops frames that repeat the previous one, which makes rendering several times faster; a typical 4-minute song takes about 5–7 s on 4 CPU cores. After that the MP4 is cached in Jellyfin's cache folder under `karaoke-cdg/`. The video has no audio, because the song's audio still plays on its own, so seeking works and the audio isn't re-encoded. The picture is slightly softer than browser drawing. The TV asks for H.264 MP4, or for VP9 WebM if its browser can't play H.264.
