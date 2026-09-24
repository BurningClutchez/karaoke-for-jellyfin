# Karaoke CDG Jellyfin plugin

A Jellyfin plugin for the `.cdg` karaoke graphics that sit next to audio files in your library. It does two things:

- Adds a **Karaoke channel** to Jellyfin's own apps. Each song with graphics plays there as a video, with the graphics and the song's audio together.
- Serves the graphics to [Karaoke for Jellyfin](../docs/CDG.md) (options B and C).

## Karaoke channel

After installing the plugin, **Karaoke** appears under Channels in Jellyfin's apps. The channel contains one folder per artist, and each song inside is a video:

- **Rendering:** the video is rendered by Jellyfin's ffmpeg the first time the song is played. That takes around 10–15 seconds for a 4-minute song on a 4-core CPU, and the client waits for it. After that it's served from the cache like any other video file, so direct play, seeking and transcoding work normally.
- **Rendering ahead:** to avoid the first-play wait, run **Dashboard → Scheduled Tasks → Karaoke → Render karaoke videos**. It renders every karaoke song. It has no schedule by default, because rendering a large library takes a while. Budget roughly 10–15 seconds per song on a 4-core CPU.
- **Who sees it:** users only see songs from libraries they can access. Access to the channel itself is managed like any other channel, under each user's settings.
- **New songs:** these appear within about 10 minutes of a library scan, or immediately after running the render task.

The videos are 900×648 H.264 with 192 kbps AAC audio. A 4-minute song is about 7 MB, mostly audio, because the graphics repeat the same frame most of the time. Rendered files live in Jellyfin's cache folder under `karaoke-cdg/`.

The first time the channel lists a song whose video hasn't been rendered, Jellyfin logs one `Error in Probe Provider` for it. This happens because Jellyfin probes new items straight away, before the video exists. It's harmless, doesn't repeat, and doesn't happen for songs that have already been rendered.

## Endpoints

Both endpoints require a Jellyfin API key or user token, sent as `Authorization: MediaBrowser Token="<token>"`. From Jellyfin 12, the older `X-Emby-Token` header and `api_key` parameter are rejected unless **Enable legacy authorization** is turned on.

| Endpoint                                    | Returns                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /Karaoke/Cdg/{itemId}`                 | The raw `.cdg` file next to the audio item (option B), or 404                                                                                                                                                                                                                                                                                                                                                        |
| `GET /Karaoke/Video/{itemId}[?format=webm]` | The graphics rendered to a silent 900×648 video with Jellyfin's ffmpeg (option C): H.264 MP4 by default, or VP9 WebM with `format=webm` for browsers that can't play H.264. Cached under `<cache>/karaoke-cdg/`. Repeated frames are dropped, so a typical song renders in a few seconds. Supports range requests. The first request waits for the render; Karaoke for Jellyfin can request it when a song is queued |

`{itemId}` must be an audio item. The plugin looks for `Name.cdg`, `Name.CDG` or `Name.Cdg` next to `Name.<ext>`.

## Build

The plugin needs the .NET 10 SDK and targets Jellyfin 12.1:

```bash
dotnet publish Jellyfin.Plugin.KaraokeCdg -c Release -o artifacts
```

The GitHub workflow `.github/workflows/jellyfin-plugin.yml` builds the same DLL and uploads it as an artifact.

## Install

1. Create a folder named `KaraokeCdg_1.0.0.0` in Jellyfin's plugin directory:
   - Docker: `/config/plugins/`
   - Linux: `/var/lib/jellyfin/plugins/`
   - Windows: `%ProgramData%\Jellyfin\Server\plugins\`
2. Copy `Jellyfin.Plugin.KaraokeCdg.dll` into it.
3. Restart Jellyfin. **Karaoke CDG** appears under Dashboard → Plugins, and **Karaoke** appears under Channels.

Jellyfin only loads plugins built for its version. After a major Jellyfin upgrade, update the `Jellyfin.Controller` and `Jellyfin.Model` versions in the `.csproj` and rebuild. Until then, the Karaoke channel is missing and Karaoke for Jellyfin falls back to lyrics.

## Settings

Both are set in the plugin's XML configuration:

- `EnableChannel` (default `true`) shows or hides the Karaoke channel.
- `EnableVideo` (default `true`) controls whether `/Karaoke/Video` may run ffmpeg. Set it to `false` to serve raw CDG files only. The channel isn't affected.
