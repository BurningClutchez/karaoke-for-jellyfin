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

## Zipped karaoke songs

With the Karaoke CDG plugin installed, zips holding one `.cdg` and one audio file work too. The plugin adds a silent placeholder song for each zip, so they're searchable. When one is queued, Karaoke for Jellyfin asks the plugin to extract it, and the TV plays the real audio and graphics. Option A (the local mount) doesn't apply to zipped songs; they always go through the plugin. See [`jellyfin-plugin/README.md`](../jellyfin-plugin/README.md#zipped-karaoke-songs).

## Setting it up

- **Option A (no plugin):** mount the karaoke folder read-only into the app and set `CDG_LOCAL_ROOT` and `CDG_JELLYFIN_ROOT`. See [HOWTO.md, section 4.2](../HOWTO.md#42-cdg-without-the-plugin).
- **Options B and C (the plugin):** install the Karaoke CDG plugin; the app needs no settings, because it calls the plugin with its `JELLYFIN_API_KEY`. Use the plugin when the app can't mount the library, for example when Jellyfin runs on a NAS. See [HOWTO.md, section 5](../HOWTO.md#5-option-b-the-app-and-the-karaoke-cdg-plugin).

## Display modes

`CDG_MODE` sets how the TV shows graphics:

| Value            | Behaviour                                                                        |
| ---------------- | -------------------------------------------------------------------------------- |
| `auto` (default) | Draw in the browser, and fall back to plugin video (C), then to lyrics           |
| `canvas`         | Draw in the browser only, and fall back to lyrics                                |
| `video`          | Always use plugin video. Useful for weak smart-TV browsers. Falls back to lyrics |
| `off`            | Ignore `.cdg` files                                                              |

## Which songs phones can pick

`SONG_FILTER` decides which songs appear when singers browse or search:

| Value               | Songs shown                                            |
| ------------------- | ------------------------------------------------------ |
| `karaoke` (default) | Songs with lyrics or CD+G graphics, badged **Karaoke** |
| `lyrics`            | Only songs with lyrics (the behaviour before CD+G)     |
| `all`               | Every song; songs with neither are badged Audio Only   |

The app learns which songs have graphics from the plugin's `/Karaoke/Songs` list, which it caches for 5 minutes. The plugin rebuilds that list at most every 10 minutes, so a new song can take up to 15 minutes to appear. Without the plugin, the app looks for the `.cdg` file in the local mount (option A). With neither, only songs with lyrics are shown.

## Rendering ahead

When a song is queued, the app asks the plugin to render its video straight away, so it's ready by the time the song comes up. Usually at least one song plays in between. Songs without a `.cdg` file get a quick 404, and nothing is rendered for them. This is on by default. Set `CDG_PRERENDER=false` to turn it off, for example if Jellyfin's CPU is weak and the TV draws graphics itself anyway. It's also off with `CDG_MODE=off`.

Only the H.264 MP4 is rendered ahead. A TV whose browser can't play H.264 asks for WebM, which is still rendered on first play.

To render **every** song ahead of time, use **Render karaoke videos** on the plugin's settings page (Jellyfin **Dashboard → Plugins → Karaoke CDG**). It first shows how many songs need rendering, the estimated time and storage, and the free space, and only starts once you confirm. See the [plugin README](../jellyfin-plugin/README.md#rendering-every-song-ahead).

## Trade-offs

- **Browser drawing (A and B)** gives sharp pixels, starts instantly, and pauses, seeks and reconnects instantly. The TV downloads the whole `.cdg` file first, about 1.7 MB for a 4-minute song.
- **Plugin video (C)** encodes each song once, on first play or when it is queued (see above). ffmpeg drops frames that repeat the previous one, which makes rendering several times faster; a typical 4-minute song takes about 5–7 s on 4 CPU cores. After that the MP4 is cached in Jellyfin's cache folder under `karaoke-cdg/`, and cleaned up like extracted zips (see the plugin README). The video has no audio, because the song's audio still plays on its own, so seeking works and the audio isn't re-encoded. The picture is slightly softer than browser drawing. The TV asks for H.264 MP4, or for VP9 WebM if its browser can't play H.264.
