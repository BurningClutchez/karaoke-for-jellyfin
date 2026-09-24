using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Tasks;

/// <summary>
/// Deletes extracted karaoke zips that haven't been used within the retention period,
/// keeping the most recently used songs.
/// </summary>
public class CleanupExtractedZipsTask : IScheduledTask
{
    private readonly ZipExtractionCache _cache;
    private readonly ILogger<CleanupExtractedZipsTask> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="CleanupExtractedZipsTask"/> class.
    /// </summary>
    /// <param name="cache">Extraction cache.</param>
    /// <param name="logger">Logger.</param>
    public CleanupExtractedZipsTask(ZipExtractionCache cache, ILogger<CleanupExtractedZipsTask> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "Clean up extracted karaoke zips";

    /// <inheritdoc />
    public string Key => "KaraokeCdgCleanupExtracted";

    /// <inheritdoc />
    public string Description => "Deletes extracted karaoke songs not used recently. They are extracted again when next sung.";

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

        progress.Report(100);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() =>
    [
        new TaskTriggerInfo { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromHours(1).Ticks },
    ];
}
