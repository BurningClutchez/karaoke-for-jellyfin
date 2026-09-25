using Jellyfin.Plugin.KaraokeCdg.Cache;
using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Tasks;

/// <summary>
/// Deletes extracted karaoke zips and rendered videos that haven't been used within their
/// retention periods, keeping the most recently used ones.
/// </summary>
public class CleanupExtractedZipsTask : IScheduledTask
{
    private readonly ZipExtractionCache _cache;
    private readonly VideoCache _videos;
    private readonly CdgVideoRenderer _renderer;
    private readonly ILogger<CleanupExtractedZipsTask> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="CleanupExtractedZipsTask"/> class.
    /// </summary>
    /// <param name="cache">Extraction cache.</param>
    /// <param name="videos">Video cache.</param>
    /// <param name="renderer">Video renderer, to skip videos being written.</param>
    /// <param name="logger">Logger.</param>
    public CleanupExtractedZipsTask(ZipExtractionCache cache, VideoCache videos, CdgVideoRenderer renderer, ILogger<CleanupExtractedZipsTask> logger)
    {
        _cache = cache;
        _videos = videos;
        _renderer = renderer;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "Clean up karaoke cache";

    /// <inheritdoc />
    public string Key => "KaraokeCdgCleanupExtracted";

    /// <inheritdoc />
    public string Description => "Deletes extracted karaoke zips and rendered karaoke videos not used recently. They are made again when next sung.";

    /// <inheritdoc />
    public string Category => "Karaoke";

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        var deleted = _cache.Cleanup(DateTime.UtcNow);
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} extracted karaoke songs", deleted);
        }

        var videos = _videos.Cleanup(DateTime.UtcNow, _renderer.IsRendering);
        if (videos > 0)
        {
            _logger.LogInformation("Deleted {Count} karaoke videos", videos);
        }

        progress.Report(100);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() =>
    [
        new TaskTriggerInfo { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromHours(1).Ticks },
    ];
}
