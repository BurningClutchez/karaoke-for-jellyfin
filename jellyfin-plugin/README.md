# Karaoke CDG Jellyfin plugin

A small Jellyfin plugin for [Karaoke for Jellyfin](../docs/CDG.md). It serves the `.cdg` karaoke graphics that sit next to audio files in your library. Jellyfin's own clients don't use it.

## Endpoints

Both endpoints require a Jellyfin API key or user token, for example the `X-Emby-Token` header.

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
3. Restart Jellyfin. **Karaoke CDG** appears under Dashboard → Plugins.

Jellyfin only loads plugins built for its version. After a major Jellyfin upgrade, update the `Jellyfin.Controller` and `Jellyfin.Model` versions in the `.csproj` and rebuild. Until then, Karaoke for Jellyfin falls back to lyrics.

## Settings

`EnableVideo` (default `true`) controls whether `/Karaoke/Video` may run ffmpeg. Set it to `false` in the plugin's XML configuration to serve raw CDG files only.
