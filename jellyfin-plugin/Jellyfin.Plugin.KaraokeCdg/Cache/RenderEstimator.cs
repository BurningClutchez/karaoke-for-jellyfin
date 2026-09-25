namespace Jellyfin.Plugin.KaraokeCdg.Cache;

/// <summary>
/// One song, as far as the render estimate cares.
/// </summary>
/// <param name="Seconds">Song length.</param>
/// <param name="Rendered">True if its video is already cached.</param>
/// <param name="ZipBytes">Size of its zip, or 0 when it isn't zipped.</param>
public sealed record SongToEstimate(double Seconds, bool Rendered, long ZipBytes);

/// <summary>
/// What rendering every karaoke video would take, shown before the render starts.
/// </summary>
/// <param name="TotalSongs">Karaoke songs in the library.</param>
/// <param name="RenderedSongs">Songs whose video is already cached.</param>
/// <param name="SongsToRender">Songs that would be rendered.</param>
/// <param name="Seconds">Estimated render time.</param>
/// <param name="Bytes">Estimated size of the new videos.</param>
/// <param name="TemporaryBytes">Estimated size of zips extracted for rendering (cleaned up later).</param>
/// <param name="FreeBytes">Free space where videos are cached, or null if unknown.</param>
/// <param name="EnoughSpace">False when the videos and extracted zips won't fit.</param>
/// <param name="FromMeasurements">True when based on this server's past renders, not defaults.</param>
/// <param name="VideoFolder">Where the videos go.</param>
/// <param name="RetentionDays">Days an unplayed video is kept (0 = forever).</param>
/// <param name="KeepRecent">Most recently played videos always kept.</param>
public sealed record RenderEstimate(
    int TotalSongs,
    int RenderedSongs,
    int SongsToRender,
    double Seconds,
    long Bytes,
    long TemporaryBytes,
    long? FreeBytes,
    bool EnoughSpace,
    bool FromMeasurements,
    string VideoFolder,
    int RetentionDays,
    int KeepRecent);

/// <summary>
/// Estimates render time and storage from past renders on this server, or from typical
/// figures (12 s and 7 MB for a 4-minute song on a 4-core CPU) until there are enough.
/// </summary>
public static class RenderEstimator
{
    /// <summary>Render seconds per second of song when nothing has been measured.</summary>
    public const double DefaultRenderRatio = 0.05;

    /// <summary>Video bytes per second of song when nothing has been measured.</summary>
    public const double DefaultBytesPerSecond = 30_000;

    /// <summary>Length assumed for songs without a known duration.</summary>
    public const double DefaultSongSeconds = 240;

    private const double ZipExtractSeconds = 1;
    private const double MinMeasuredSeconds = 600;

    /// <summary>
    /// Works out the estimate.
    /// </summary>
    /// <param name="songs">All karaoke songs.</param>
    /// <param name="stats">Totals over past renders.</param>
    /// <param name="freeBytes">Free space where videos are cached, or null if unknown.</param>
    /// <param name="videoFolder">Where the videos go.</param>
    /// <param name="retentionDays">Days an unplayed video is kept.</param>
    /// <param name="keepRecent">Most recently played videos always kept.</param>
    /// <returns>The estimate.</returns>
    public static RenderEstimate Estimate(
        IReadOnlyCollection<SongToEstimate> songs,
        RenderStats stats,
        long? freeBytes,
        string videoFolder,
        int retentionDays,
        int keepRecent)
    {
        var measured = stats.MediaSeconds >= MinMeasuredSeconds;
        var renderRatio = measured ? stats.RenderSeconds / stats.MediaSeconds : DefaultRenderRatio;
        var bytesPerSecond = measured ? stats.Bytes / stats.MediaSeconds : DefaultBytesPerSecond;

        var toRender = songs.Where(song => !song.Rendered).ToList();
        var songSeconds = toRender.Sum(song => song.Seconds > 0 ? song.Seconds : DefaultSongSeconds);
        var zipped = toRender.Where(song => song.ZipBytes > 0).ToList();
        var bytes = (long)(songSeconds * bytesPerSecond);
        var temporary = zipped.Sum(song => song.ZipBytes);

        return new RenderEstimate(
            songs.Count,
            songs.Count - toRender.Count,
            toRender.Count,
            (songSeconds * renderRatio) + (zipped.Count * ZipExtractSeconds),
            bytes,
            temporary,
            freeBytes,
            freeBytes is null || freeBytes >= bytes + temporary,
            measured,
            videoFolder,
            Math.Max(retentionDays, 0),
            Math.Max(keepRecent, 0));
    }
}
