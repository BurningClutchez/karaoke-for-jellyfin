# Karaoke CDG Jellyfin plugin

A Jellyfin plugin for `.cdg` karaoke songs: an audio file with a `.cdg` file of the same name next to it, or a zip holding one of each. It:

- adds a **Karaoke channel** to Jellyfin's own apps, where each song plays as a video with its graphics;
- serves the graphics to [Karaoke for Jellyfin](../docs/CDG.md) (options B and C);
- makes **zipped karaoke songs** searchable and playable without unzipping your collection.

## Install

1. Build the DLL (see [Build](#build)), or download it from the "Jellyfin plugin" GitHub workflow.
2. Create a folder named `KaraokeCdg_1.0.0.0` in Jellyfin's plugin directory (Docker: `/config/plugins/`, Linux: `/var/lib/jellyfin/plugins/`, Windows: `%ProgramData%\Jellyfin\Server\plugins\`) and copy `Jellyfin.Plugin.KaraokeCdg.dll` into it.
3. Restart Jellyfin. **Karaoke CDG** appears under **Dashboard → Plugins**, and **Karaoke** under Channels.

The plugin targets Jellyfin 12.1. After a major Jellyfin upgrade, update the `Jellyfin.Controller` and `Jellyfin.Model` versions in the `.csproj` and rebuild.

## Settings

Open **Dashboard → Plugins → Karaoke CDG**. Invalid values are logged as warnings and listed by `/Karaoke/Status`.

| Setting                                   | Default                       | What it does                                                                                    |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Show the Karaoke channel                  | on                            | Shows or hides the channel in Jellyfin's apps                                                   |
| Render videos for Karaoke for Jellyfin    | on                            | Lets `/Karaoke/Video` run ffmpeg. Off serves raw CDG files only                                 |
| Video folder                              | `<cache>/karaoke-cdg`         | Where rendered videos are cached                                                                |
| Keep unplayed videos for (days)           | 30                            | Videos not played for this long are deleted. 0 keeps them forever                               |
| Always keep recently played videos        | 100                           | The most recently played videos are never deleted                                               |
| Zip folders                               | every music library           | Folders searched for karaoke zips                                                               |
| Placeholder folder                        | `<data>/karaoke-placeholders` | Where placeholders for zipped songs go                                                          |
| Put placeholders next to each zip         | off                           | Writes `<zip name>.mp3` next to each zip instead                                                |
| Create a Karaoke library                  | on                            | Adds a "Karaoke" music library for the placeholder folder                                       |
| Watch zip folders                         | off                           | Makes placeholders ~30 s after a new zip appears. After a restart; unreliable on network shares |
| Extraction folder                         | `<cache>/karaoke-zips`        | Where zips are extracted when a song is used                                                    |
| Keep unused extracted songs for (hours)   | 24                            | Extracted songs not used for this long are deleted                                              |
| Always keep recently used extracted songs | 100                           | The most recently used extracted songs are never deleted                                        |

The settings are stored in `plugins/configurations/Jellyfin.Plugin.KaraokeCdg.xml` under the names used in `PluginConfiguration.cs`.

## Karaoke channel

Each song in the channel is a 900×648 H.264 video with 192 kbps AAC audio, about 7 MB for a 4-minute song. Songs are grouped into one folder per artist, and users only see songs from libraries they can access.

A song's video is rendered by Jellyfin's ffmpeg the first time it's played, which takes around 10–15 seconds on a 4-core CPU. After that it plays from the cache like any other video. New songs appear within about 10 minutes of a library scan.

The first time the channel lists a song that hasn't been rendered, Jellyfin logs one harmless `Error in Probe Provider` for it.

## Rendering every song ahead

To avoid the first-play wait, click **Render karaoke videos** at the top of the plugin's settings page:

1. A **Calculating…** dialog appears while the plugin lists the karaoke songs and checks which are already rendered.
2. A confirmation then shows the songs to render, the **estimated time**, the **estimated storage**, the temporary space for extracting zips, and the free space. It warns if the space may not be enough.
3. Rendering starts only when you confirm. A progress bar shows how far it has got, and **Stop rendering** cancels it; finished videos are kept.

Estimates start from typical figures (12 s and 7 MB per 4-minute song on a 4-core CPU) and switch to this server's own measurements once it has rendered about 10 minutes of songs. Rendering keeps the CPU busy, so playback and transcoding may be slower meanwhile.

The task is hidden from **Scheduled Tasks** so it can't be started without this confirmation.

## Video cache

Rendered videos are cached like extracted zips. The hourly **Clean up karaoke cache** task deletes a video that hasn't been played for 30 days, unless it's among the 100 most recently played. A deleted video is rendered again when next needed. Set **Keep unplayed videos for** to 0 to keep every video, for example after rendering the whole library.

## Zipped karaoke songs

Jellyfin ignores `.zip` files, so the plugin gives each karaoke zip a **placeholder**: a silent MP3, as long as the song, with its title, artist and album (from the audio's tags, or from a zip name like `Artist - Title.zip`). Placeholders make zipped songs show up in searches and favorites; they are never played themselves.

When a zipped song is queued in Karaoke for Jellyfin, or played in the channel, its zip is extracted into the extraction folder and the real files are used. Extracting takes under a second.

- **Which zips count:** exactly one `.cdg` file and one audio file (MP3, M4A, AAC, OGG, Opus, FLAC, WAV or WMA). `__MACOSX` clutter is ignored, files are extracted under fixed names, and entries over 500 MB are refused.
- **When placeholders are made:** after every library scan, by the hourly **Create karaoke placeholders** task, and within about 30 seconds if **Watch zip folders** is on. Only new or changed zips are read; the first pass takes about 1–1.5 s per zip.
- **Keeping in step:** deleted zips lose their placeholder and changed zips get a new one. If a whole zip folder is missing, as with a disconnected NAS, nothing is removed.
- **Where placeholders go:** by default into their own folder, with its own Karaoke library, because a placeholder played in Jellyfin's music player is silent.

## Endpoints

All endpoints need a Jellyfin API key or user token in `Authorization: MediaBrowser Token="<token>"`. Jellyfin 12 rejects the older `X-Emby-Token` header and `api_key` parameter unless legacy authorization is on.

| Endpoint                                    | Returns                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /Karaoke/Cdg/{itemId}`                 | The raw `.cdg` file (option B), or 404                                                                                                     |
| `GET /Karaoke/Video/{itemId}[?format=webm]` | The graphics as a silent 900×648 video (option C): H.264 MP4, or VP9 WebM. Rendered on first request, then cached. Supports range requests |
| `GET /Karaoke/Prepare/{itemId}`             | Extracts a zipped song ahead of use; returns `{"ZipBacked": bool, "HasCdg": bool}`                                                         |
| `GET /Karaoke/Audio/{itemId}`               | The real audio of a zipped song. Supports range requests                                                                                   |
| `GET /Karaoke/Songs`                        | Ids of the songs with CD+G graphics, so Karaoke for Jellyfin can list them even without lyrics                                             |
| `GET /Karaoke/Status`                       | Version, ffmpeg found, placeholder and extracted-song counts, settings warnings                                                            |
| `GET /Karaoke/Render/Estimate`              | Admins: songs to render, estimated seconds and bytes, temporary bytes, free space                                                          |
| `POST /Karaoke/Render/Start`                | Admins: starts rendering every song ahead                                                                                                  |
| `GET /Karaoke/Render/Status`                | Admins: render state and progress                                                                                                          |
| `POST /Karaoke/Render/Cancel`               | Admins: stops the render                                                                                                                   |

`{itemId}` must be an audio item. For songs that aren't zipped, the plugin looks for `Name.cdg`, `Name.CDG` or `Name.Cdg` next to `Name.<ext>`.

## Build

Needs the .NET 10 SDK:

```bash
dotnet publish Jellyfin.Plugin.KaraokeCdg -c Release -o artifacts
```

The GitHub workflow `.github/workflows/jellyfin-plugin.yml` builds the same DLL and uploads it as an artifact.
