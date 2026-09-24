using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.KaraokeCdg.Tasks;

/// <summary>
/// Makes placeholders for new karaoke zips (and removes those of deleted zips). Also runs
/// after every library scan; this hourly run catches zips added in between.
/// </summary>
public class CreatePlaceholdersTask : IScheduledTask
{
    private readonly PlaceholderSync _sync;

    /// <summary>
    /// Initializes a new instance of the <see cref="CreatePlaceholdersTask"/> class.
    /// </summary>
    /// <param name="sync">Placeholder sync.</param>
    public CreatePlaceholdersTask(PlaceholderSync sync)
    {
        _sync = sync;
    }

    /// <inheritdoc />
    public string Name => "Create karaoke placeholders";

    /// <inheritdoc />
    public string Key => "KaraokeCdgCreatePlaceholders";

    /// <inheritdoc />
    public string Description => "Makes zipped karaoke songs searchable by adding a placeholder for each new zip.";

    /// <inheritdoc />
    public string Category => "Karaoke";

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken) =>
        _sync.RunAsync(progress, cancellationToken);

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() =>
    [
        new TaskTriggerInfo { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromHours(1).Ticks },
    ];
}
