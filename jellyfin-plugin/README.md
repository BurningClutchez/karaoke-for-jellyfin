# Karaoke CDG Jellyfin plugin

A Jellyfin plugin for `.cdg` karaoke songs, either an audio file with a `.cdg` file of the same name next to it, or a zip holding one of each. It does three things:

- Adds a **Karaoke channel** to Jellyfin's own apps. Each song with graphics plays there as a video, with the graphics and the song's audio together.
- Serves the graphics to [Karaoke for Jellyfin](../docs/CDG.md) (options B and C).
- Makes **zipped karaoke songs** searchable and playable without unzipping your collection.

## Karaoke channel

After installing the plugin, **Karaoke** appears under Channels in Jellyfin's apps. The channel contains one folder per artist, and each song inside is a video:

- **Rendering:** the video is rendered by Jellyfin's ffmpeg the first time the song is played. That takes around 10–15 seconds for a 4-minute song on a 4-core CPU, and the client waits for it. After that it's served from the cache like any other video file, so direct play, seeking and transcoding work normally.
- **Rendering ahead:** to avoid the first-play wait, run **Dashboard → Scheduled Tasks → Karaoke → Render karaoke videos**. It renders every karaoke song. It has no schedule by default, because rendering a large library takes a while. Budget roughly 10–15 seconds per song on a 4-core CPU.
- **Who sees it:** users only see songs from libraries they can access. Access to the channel itself is managed like any other channel, under each user's settings.
- **New songs:** these appear within about 10 minutes of a library scan, or immediately after running the render task.

The videos are 900×648 H.264 with 192 kbps AAC audio. A 4-minute song is about 7 MB, mostly audio, because the graphics repeat the same frame most of the time. Rendered files live in Jellyfin's cache folder under `karaoke-cdg/`.

The first time the channel lists a song whose video hasn't been rendered, Jellyfin logs one `Error in Probe Provider` for it. This happens because Jellyfin probes new items straight away, before the video exists. It's harmless, doesn't repeat, and doesn't happen for songs that have already been rendered.

## Zipped karaoke songs

Jellyfin ignores `.zip` files, so the plugin gives each karaoke zip a **placeholder**:

- **What it is:** a silent MP3, the same length as the song, carrying the song's title, artist and album. Titles and artists come from the audio's tags, or from the zip's name ("Artist - Title.zip" or "DISC-01 - Artist - Title.zip") when it has none.
- **Size:** about 60 KB per minute of song.
- **Why it matters:** because of the placeholder, zipped songs show up in searches and favorites like any other song.

When a song is queued in Karaoke for Jellyfin, or played in the Karaoke channel, its zip is extracted into a temporary folder and the real audio and graphics are used. The placeholder itself is never played.

**Which zips count:** a zip is used when it contains exactly one `.cdg` file and one audio file (MP3, M4A, AAC, OGG, Opus, FLAC, WAV or WMA). macOS `__MACOSX` clutter is ignored. Other zips are left alone. Files are always extracted under fixed names, so a zip can't write anywhere else, and entries over 500 MB are refused.

**When placeholders are made for new zips:**

- after every Jellyfin library scan;
- by the **Create karaoke placeholders** task, hourly by default, and on demand from **Dashboard → Scheduled Tasks → Karaoke**;
- within about 30 seconds, if `WatchZipFolders` is on. This is off by default, because network shares often don't report new files.

Each pass only processes new or changed zips, so passes over an unchanged collection take seconds. The first pass reads every zip, at roughly 1–1.5 s each for a 4-minute song (about 25–40 minutes per 1,000 zips).

**Keeping placeholders in step:**

- If a zip is deleted, its placeholder is removed.
- If a zip changes, its placeholder is rebuilt.
- If a whole zip folder is missing, as with a disconnected NAS, nothing is removed.
- Changed folders are refreshed straight away, without a full library scan.

**Where placeholders go:** by default, into `karaoke-placeholders` in Jellyfin's data folder. The plugin adds a **Karaoke** music library for that folder automatically. Keeping them out of your music library matters because a placeholder played in Jellyfin's normal music player is silent. With `PlaceholdersNextToZips` they're written next to each zip instead, named `<zip name>.mp3`. A real file already at that path is never overwritten. Changing this setting moves the existing placeholders on the next pass. After switching to next-to-zips, you can remove the empty Karaoke library.

**Temporary folder:**

- **Location:** `karaoke-zips` in Jellyfin's cache folder, or `ExtractFolder`.
- **Cleanup:** the **Clean up extracted karaoke zips** task runs hourly. It deletes a song once it hasn't been used for `ExtractRetentionHours` (default 24), unless it's among the `KeepRecentCount` (default 100) most recently used songs, which are listed in `recent.json` in that folder.
- **Re-extraction:** a deleted song is extracted again, in under a second, the next time it's used.
- **Note:** running **Render karaoke videos** extracts every zipped song, so they all count as recently used.

## Endpoints

All endpoints require a Jellyfin API key or user token, sent as `Authorization: MediaBrowser Token="<token>"`. From Jellyfin 12, the older `X-Emby-Token` header and `api_key` parameter are rejected unless **Enable legacy authorization** is turned on.

| Endpoint                                    | Returns                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /Karaoke/Cdg/{itemId}`                 | The raw `.cdg` file (option B), from next to the audio item or from the zip behind a placeholder, or 404                                                                                                                                                                                                                                                                                                             |
| `GET /Karaoke/Video/{itemId}[?format=webm]` | The graphics rendered to a silent 900×648 video with Jellyfin's ffmpeg (option C): H.264 MP4 by default, or VP9 WebM with `format=webm` for browsers that can't play H.264. Cached under `<cache>/karaoke-cdg/`. Repeated frames are dropped, so a typical song renders in a few seconds. Supports range requests. The first request waits for the render; Karaoke for Jellyfin can request it when a song is queued |
| `GET /Karaoke/Prepare/{itemId}`             | Extracts a zipped song ahead of use and returns `{"ZipBacked": bool, "HasCdg": bool}`. Karaoke for Jellyfin calls it when a song is queued                                                                                                                                                                                                                                                                           |
| `GET /Karaoke/Audio/{itemId}`               | The real audio of a zipped song (its item is a silent placeholder). Supports range requests. 404 for other items                                                                                                                                                                                                                                                                                                     |

`{itemId}` must be an audio item. For a song that isn't zipped, the plugin looks for `Name.cdg`, `Name.CDG` or `Name.Cdg` next to `Name.<ext>`.

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

All are set in the plugin's XML configuration (`plugins/configurations/Jellyfin.Plugin.KaraokeCdg.xml`):

| Setting                  | Default   | What it does                                                                                             |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------- |
| `EnableChannel`          | `true`    | Shows or hides the Karaoke channel                                                                       |
| `EnableVideo`            | `true`    | Lets `/Karaoke/Video` run ffmpeg. Set to `false` to serve raw CDG files only. The channel isn't affected |
| `PlaceholderFolder`      | _(empty)_ | Folder for placeholders. Empty means `karaoke-placeholders` in Jellyfin's data folder                    |
| `PlaceholdersNextToZips` | `false`   | Write placeholders next to each zip, in the music library, instead                                       |
| `CreateKaraokeLibrary`   | `true`    | Add a "Karaoke" music library for the placeholder folder if no library contains it                       |
| `ZipFolders`             | _(empty)_ | Folders to search for zips. Empty means every music library                                              |
| `ExtractFolder`          | _(empty)_ | Temporary folder for extracted zips. Empty means `karaoke-zips` in Jellyfin's cache folder               |
| `ExtractRetentionHours`  | `24`      | Hours an extracted song is kept after its last use                                                       |
| `KeepRecentCount`        | `100`     | Most recently used extracted songs that are always kept                                                  |
| `WatchZipFolders`        | `false`   | Watch the zip folders and make placeholders about 30 s after a change. Takes effect after a restart      |
