using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Checks for new karaoke zips after every Jellyfin library scan.
/// </summary>
public class PlaceholderPostScanTask : ILibraryPostScanTask
{
    private readonly PlaceholderSync _sync;

    /// <summary>
    /// Initializes a new instance of the <see cref="PlaceholderPostScanTask"/> class.
    /// </summary>
    /// <param name="sync">Placeholder sync.</param>
    public PlaceholderPostScanTask(PlaceholderSync sync)
    {
        _sync = sync;
    }

    /// <inheritdoc />
    public Task Run(IProgress<double> progress, CancellationToken cancellationToken) =>
        _sync.RunAsync(progress, cancellationToken);
}
