using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// A karaoke zip extracted to disk.
/// </summary>
/// <param name="AudioPath">Extracted audio file.</param>
/// <param name="CdgPath">Extracted CDG file.</param>
public sealed record ExtractedSong(string AudioPath, string CdgPath);

/// <summary>
/// Extracts karaoke zips into a temporary folder when a song is used, and deletes them again
/// once they are older than the retention period and not among the most recently used songs.
/// </summary>
public sealed class ZipExtractionCache
{
    private const string RecentLogName = "recent.json";
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<ZipExtractionCache> _logger;
    private readonly Lock _logLock = new();

    /// <summary>
    /// Initializes a new instance of the <see cref="ZipExtractionCache"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin paths.</param>
    /// <param name="logger">Logger.</param>
    public ZipExtractionCache(IApplicationPaths applicationPaths, ILogger<ZipExtractionCache> logger)
    {
        _applicationPaths = applicationPaths;
        _logger = logger;
    }

    /// <summary>
    /// Gets the folder zips are extracted into.
    /// </summary>
    public string Root
    {
        get
        {
            var configured = Plugin.Instance?.Configuration.ExtractFolder;
            return string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(_applicationPaths.CachePath, "karaoke-zips")
                : configured;
        }
    }

    /// <summary>
    /// Gets the extraction folder name for a zip. It changes when the zip changes.
    /// </summary>
    /// <param name="zip">The zip.</param>
    /// <returns>The folder name.</returns>
    public static string FolderName(ZipRecord zip) =>
        ZipNaming.ShortHash(string.Create(CultureInfo.InvariantCulture, $"{zip.ZipPath}|{zip.ZipSize}|{zip.ZipModifiedTicks}"))
        + ZipNaming.ShortHash(zip.ZipPath);

    /// <summary>
    /// Returns the extracted files for a karaoke zip, extracting them first if needed, and
    /// marks the song as recently used.
    /// </summary>
    /// <param name="zip">The zip.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The extracted files, or null if the zip can't be read.</returns>
    public async Task<ExtractedSong?> EnsureAsync(ZipRecord zip, CancellationToken cancellationToken)
    {
        if (!zip.IsKaraoke)
        {
            return null;
        }

        var name = FolderName(zip);
        var folder = Path.Combine(Root, name);
        var song = new ExtractedSong(
            Path.Combine(folder, "song" + KaraokeZip.AudioExtension(zip.AudioEntry!)),
            Path.Combine(folder, "song.cdg"));
        var gate = _locks.GetOrAdd(name, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!File.Exists(song.AudioPath) || !File.Exists(song.CdgPath))
            {
                Directory.CreateDirectory(folder);
                await Task.Run(
                    () =>
                    {
                        KaraokeZip.ExtractEntry(zip.ZipPath, zip.CdgEntry!, song.CdgPath);
                        KaraokeZip.ExtractEntry(zip.ZipPath, zip.AudioEntry!, song.AudioPath);
                    },
                    cancellationToken).ConfigureAwait(false);
                _logger.LogInformation("Extracted {Zip}", zip.ZipPath);
            }

            MarkUsed(name, folder);
            return song;
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException)
        {
            _logger.LogError(ex, "Could not extract {Zip}", zip.ZipPath);
            return null;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>
    /// Deletes extracted songs last used longer ago than the retention period, unless they are
    /// among the most recently used songs. Songs are extracted again when next used.
    /// </summary>
    /// <param name="now">Current time (UTC).</param>
    /// <returns>How many extracted songs were deleted.</returns>
    public int Cleanup(DateTime now)
    {
        if (!Directory.Exists(Root))
        {
            return 0;
        }

        var config = Plugin.Instance?.Configuration;
        var retention = TimeSpan.FromHours(Math.Max(config?.ExtractRetentionHours ?? 24, 0));
        var keep = ReadRecent().Take(Math.Max(config?.KeepRecentCount ?? 100, 0)).ToHashSet(StringComparer.Ordinal);
        var deleted = 0;

        foreach (var folder in Directory.EnumerateDirectories(Root))
        {
            // Only folders this cache created, in case ExtractFolder points somewhere shared
            var name = Path.GetFileName(folder);
            if (!IsCacheFolderName(name) || keep.Contains(name) || now - Directory.GetLastWriteTimeUtc(folder) < retention)
            {
                continue;
            }

            var gate = _locks.GetOrAdd(name, _ => new SemaphoreSlim(1, 1));
            if (!gate.Wait(0))
            {
                continue; // Being extracted right now
            }

            try
            {
                Directory.Delete(folder, recursive: true);
                deleted++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Probably still being streamed (Windows); try again next time
                _logger.LogDebug(ex, "Could not delete {Folder} yet", folder);
            }
            finally
            {
                gate.Release();
            }
        }

        return deleted;
    }

    /// <summary>
    /// Checks whether a folder name has the form this cache gives extraction folders
    /// (16 lower-case hex characters).
    /// </summary>
    /// <param name="name">Folder name.</param>
    /// <returns>True for extraction folders.</returns>
    public static bool IsCacheFolderName(string name) =>
        name.Length == 16 && name.All(c => char.IsAsciiHexDigitLower(c) || char.IsAsciiDigit(c));

    /// <summary>
    /// Gets extraction folder names, most recently used first.
    /// </summary>
    /// <returns>The folder names.</returns>
    public IReadOnlyList<string> ReadRecent()
    {
        lock (_logLock)
        {
            return ReadRecentUnlocked();
        }
    }

    private List<string> ReadRecentUnlocked()
    {
        try
        {
            var path = Path.Combine(Root, RecentLogName);
            return File.Exists(path)
                ? JsonSerializer.Deserialize<List<string>>(File.ReadAllText(path)) ?? []
                : [];
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            return [];
        }
    }

    private void MarkUsed(string name, string folder)
    {
        // The folder's timestamp is its "last used" time for the retention rule
        Directory.SetLastWriteTimeUtc(folder, DateTime.UtcNow);
        var limit = Math.Max(Plugin.Instance?.Configuration.KeepRecentCount ?? 100, 0);
        lock (_logLock)
        {
            var recent = ReadRecentUnlocked().Where(entry => entry != name).Prepend(name).Take(limit).ToList();
            var path = Path.Combine(Root, RecentLogName);
            File.WriteAllText(path + ".partial", JsonSerializer.Serialize(recent));
            File.Move(path + ".partial", path, overwrite: true);
        }
    }
}
