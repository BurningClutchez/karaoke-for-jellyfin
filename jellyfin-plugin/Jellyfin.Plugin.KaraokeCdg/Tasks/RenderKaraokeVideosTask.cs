using Jellyfin.Plugin.KaraokeCdg.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Tasks;

/// <summary>
/// Renders the karaoke video of every song in the Karaoke channel ahead of time, so nothing
/// waits for ffmpeg at play time. Runs only when started from the dashboard.
/// </summary>
public class RenderKaraokeVideosTask : IScheduledTask
{
    private readonly KaraokeLibraryIndex _index;
    private readonly CdgVideoRenderer _renderer;
    private readonly ILogger<RenderKaraokeVideosTask> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="RenderKaraokeVideosTask"/> class.
    /// </summary>
    /// <param name="index">Karaoke song index.</param>
    /// <param name="renderer">Video renderer.</param>
    /// <param name="logger">Logger.</param>
    public RenderKaraokeVideosTask(KaraokeLibraryIndex index, CdgVideoRenderer renderer, ILogger<RenderKaraokeVideosTask> logger)
    {
        _index = index;
        _renderer = renderer;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "Render karaoke videos";

    /// <inheritdoc />
    public string Key => "KaraokeCdgRenderVideos";

    /// <inheritdoc />
    public string Description => "Renders the CD+G graphics and audio of every karaoke song to video for the Karaoke channel.";

    /// <inheritdoc />
    public string Category => "Karaoke";

    /// <inheritdoc />
    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        _index.Invalidate();
        var songs = _index.GetSongs();
        var failed = 0;
        for (var i = 0; i < songs.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (await _renderer.GetOrRenderAsync(KaraokeChannel.ToJob(songs[i])).ConfigureAwait(false) is null)
            {
                failed++;
            }

            progress.Report(100.0 * (i + 1) / songs.Count);
        }

        _logger.LogInformation("Karaoke videos ready for {Count} songs ({Failed} failed)", songs.Count - failed, failed);
    }

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers() => [];
}
