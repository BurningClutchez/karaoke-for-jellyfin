using System.Text.Json;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Cache;

/// <summary>
/// Totals over finished karaoke renders (graphics plus audio), used to estimate new ones.
/// </summary>
/// <param name="MediaSeconds">Length of the rendered songs.</param>
/// <param name="RenderSeconds">Time spent rendering them.</param>
/// <param name="Bytes">Size of the rendered videos.</param>
/// <param name="Count">Number of renders.</param>
public sealed record RenderStats(double MediaSeconds, double RenderSeconds, long Bytes, int Count);

/// <summary>
/// The folder rendered videos are cached in. Like extracted zips, a video is deleted once it
/// hasn't been played for the retention period, unless it is among the most recently played.
/// </summary>
public sealed partial class VideoCache
{
    private const string StatsName = "render-stats.json";
    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<VideoCache> _logger;
    private readonly RecentUseLog _recent;
    private readonly Lock _statsLock = new();

    /// <summary>
    /// Initializes a new instance of the <see cref="VideoCache"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin paths.</param>
    /// <param name="logger">Logger.</param>
    public VideoCache(IApplicationPaths applicationPaths, ILogger<VideoCache> logger)
    {
        _applicationPaths = applicationPaths;
        _logger = logger;
        _recent = new RecentUseLog(() => Root);
    }

    /// <summary>
    /// Gets the folder videos are cached in.
    /// </summary>
    public string Root
    {
        get
        {
            var configured = Plugin.Instance?.Configuration.VideoFolder;
            return string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(_applicationPaths.CachePath, "karaoke-cdg")
                : configured;
        }
    }

    /// <summary>
    /// Checks whether a file name has the form the renderer gives videos.
    /// </summary>
    /// <param name="name">File name.</param>
    /// <returns>True for rendered videos.</returns>
    public static bool IsVideoName(string name) => VideoNamePattern().IsMatch(name);

    /// <summary>
    /// Records that a video was played or rendered, which restarts its retention period.
    /// </summary>
    /// <param name="videoPath">The video file.</param>
    public void MarkUsed(string videoPath)
    {
        try
        {
            File.SetLastWriteTimeUtc(videoPath, DateTime.UtcNow);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogDebug(ex, "Could not update the time of {Video}", videoPath);
        }

        _recent.MarkUsed(Path.GetFileName(videoPath), Plugin.Instance?.Configuration.KeepRecentVideos ?? 100);
    }

    /// <summary>
    /// Deletes videos not played within the retention period, keeping the most recently
    /// played ones. They are rendered again when next played.
    /// </summary>
    /// <param name="now">Current time (UTC).</param>
    /// <param name="isRendering">Tells whether a video is being written right now.</param>
    /// <returns>How many videos were deleted.</returns>
    public int Cleanup(DateTime now, Func<string, bool> isRendering)
    {
        var config = Plugin.Instance?.Configuration;
        var days = config?.VideoRetentionDays ?? 30;
        if (days <= 0 || !Directory.Exists(Root))
        {
            return 0;
        }

        var keep = _recent.Read().Take(Math.Max(config?.KeepRecentVideos ?? 100, 0)).ToHashSet(StringComparer.Ordinal);
        var deleted = 0;
        foreach (var video in Directory.EnumerateFiles(Root))
        {
            var name = Path.GetFileName(video);
            if (!IsVideoName(name) || keep.Contains(name) || isRendering(video)
                || now - File.GetLastWriteTimeUtc(video) < TimeSpan.FromDays(days))
            {
                continue;
            }

            try
            {
                File.Delete(video);
                deleted++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Probably being streamed (Windows); try again next time
                _logger.LogDebug(ex, "Could not delete {Video} yet", video);
            }
        }

        return deleted;
    }

    /// <summary>
    /// Gets the totals over finished renders.
    /// </summary>
    /// <returns>The totals, zero before the first render.</returns>
    public RenderStats ReadStats()
    {
        lock (_statsLock)
        {
            return ReadStatsUnlocked();
        }
    }

    /// <summary>
    /// Adds a finished render to the totals.
    /// </summary>
    /// <param name="mediaSeconds">Length of the song.</param>
    /// <param name="renderSeconds">Time the render took.</param>
    /// <param name="bytes">Size of the video.</param>
    public void AddRender(double mediaSeconds, double renderSeconds, long bytes)
    {
        lock (_statsLock)
        {
            var stats = ReadStatsUnlocked();
            var updated = new RenderStats(stats.MediaSeconds + mediaSeconds, stats.RenderSeconds + renderSeconds, stats.Bytes + bytes, stats.Count + 1);
            try
            {
                var path = Path.Combine(Root, StatsName);
                File.WriteAllText(path + ".partial", JsonSerializer.Serialize(updated));
                File.Move(path + ".partial", path, overwrite: true);
            }
            catch (IOException ex)
            {
                _logger.LogDebug(ex, "Could not save render statistics");
            }
        }
    }

    /// <summary>
    /// Gets the free space on the drive holding the cache folder.
    /// </summary>
    /// <returns>Free bytes, or null if unknown.</returns>
    public long? FreeBytes()
    {
        try
        {
            Directory.CreateDirectory(Root);
            return new DriveInfo(Root).AvailableFreeSpace;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return null;
        }
    }

    private RenderStats ReadStatsUnlocked()
    {
        try
        {
            var path = Path.Combine(Root, StatsName);
            return File.Exists(path)
                ? JsonSerializer.Deserialize<RenderStats>(File.ReadAllText(path)) ?? new RenderStats(0, 0, 0, 0)
                : new RenderStats(0, 0, 0, 0);
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            return new RenderStats(0, 0, 0, 0);
        }
    }

    [GeneratedRegex("^[0-9a-f]{32}-[0-9a-z-]+\\.(mp4|webm)$")]
    private static partial Regex VideoNamePattern();
}
