using Jellyfin.Plugin.KaraokeCdg.Cache;
using Jellyfin.Plugin.KaraokeCdg.Library;
using Jellyfin.Plugin.KaraokeCdg.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.KaraokeCdg.Api;

/// <summary>
/// Progress of the "Render karaoke videos" task.
/// </summary>
/// <param name="State">Idle, Running or Cancelling.</param>
/// <param name="Progress">Percent done while running.</param>
/// <param name="LastResult">Completed, Failed, Cancelled or Aborted, from the last run.</param>
/// <param name="LastEnded">When the last run ended (UTC).</param>
public sealed record RenderStatus(string State, double? Progress, string? LastResult, DateTime? LastEnded);

/// <summary>
/// Renders every karaoke video ahead of time, from the plugin's settings page. Administrators only.
/// </summary>
[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("Karaoke/Render")]
public class RenderController : ControllerBase
{
    private readonly KaraokeLibraryIndex _index;
    private readonly KaraokeSongRenderer _songRenderer;
    private readonly VideoCache _videos;
    private readonly ITaskManager _taskManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="RenderController"/> class.
    /// </summary>
    /// <param name="index">Karaoke song index.</param>
    /// <param name="songRenderer">Finds each song's cached video.</param>
    /// <param name="videos">Video cache.</param>
    /// <param name="taskManager">Runs the render task.</param>
    public RenderController(KaraokeLibraryIndex index, KaraokeSongRenderer songRenderer, VideoCache videos, ITaskManager taskManager)
    {
        _index = index;
        _songRenderer = songRenderer;
        _videos = videos;
        _taskManager = taskManager;
    }

    /// <summary>
    /// Estimates how long rendering every karaoke video would take and how much space it needs.
    /// Lists the library first, so it can take a few seconds.
    /// </summary>
    /// <response code="200">The estimate.</response>
    /// <returns>The estimate.</returns>
    [HttpGet("Estimate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<RenderEstimate> GetEstimate()
    {
        _index.Invalidate();
        var songs = _index.GetSongs().Select(ToEstimate).ToList();
        var config = Plugin.Instance?.Configuration;
        return RenderEstimator.Estimate(
            songs,
            _videos.ReadStats(),
            _videos.FreeBytes(),
            _videos.Root,
            config?.VideoRetentionDays ?? 30,
            config?.KeepRecentVideos ?? 100);
    }

    /// <summary>
    /// Starts rendering every karaoke video that isn't cached yet.
    /// </summary>
    /// <response code="202">Rendering started (or was already running).</response>
    /// <returns>The task status.</returns>
    [HttpPost("Start")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    public async Task<ActionResult<RenderStatus>> Start()
    {
        _taskManager.QueueIfNotRunning<RenderKaraokeVideosTask>();

        // The task manager starts the task in the background; wait briefly so the settings
        // page sees it running and starts showing progress
        var status = GetStatus().Value!;
        for (var i = 0; i < 20 && status.State == "Idle"; i++)
        {
            await Task.Delay(100).ConfigureAwait(false);
            status = GetStatus().Value!;
        }

        return Accepted(status);
    }

    /// <summary>
    /// Stops a running render. Videos finished so far are kept.
    /// </summary>
    /// <response code="200">Cancellation requested.</response>
    /// <returns>The task status.</returns>
    [HttpPost("Cancel")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<RenderStatus> Cancel()
    {
        _taskManager.CancelIfRunning<RenderKaraokeVideosTask>();
        return GetStatus();
    }

    /// <summary>
    /// Gets the progress of the render.
    /// </summary>
    /// <response code="200">The task status.</response>
    /// <returns>The task status.</returns>
    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<RenderStatus> GetStatus()
    {
        var worker = _taskManager.ScheduledTasks.FirstOrDefault(task => task.ScheduledTask is RenderKaraokeVideosTask);
        if (worker is null)
        {
            return new RenderStatus("Idle", null, null, null);
        }

        var last = worker.LastExecutionResult;
        return new RenderStatus(worker.State.ToString(), worker.CurrentProgress, last?.Status.ToString(), last?.EndTimeUtc);
    }

    private SongToEstimate ToEstimate(KaraokeSong song)
    {
        var seconds = song.RunTimeTicks is > 0 ? TimeSpan.FromTicks(song.RunTimeTicks.Value).TotalSeconds : 0;
        try
        {
            var rendered = System.IO.File.Exists(_songRenderer.GetCachePath(song));
            var zipBytes = song.ZipPath is not null && !rendered ? new FileInfo(song.ZipPath).Length : 0;
            return new SongToEstimate(seconds, rendered, zipBytes);
        }
        catch (IOException)
        {
            // The song's files went away since the index was built; the render skips it too
            return new SongToEstimate(0, true, 0);
        }
    }
}
