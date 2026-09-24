using System.ComponentModel.DataAnnotations;
using System.Net.Mime;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using AudioItem = MediaBrowser.Controller.Entities.Audio.Audio;

namespace Jellyfin.Plugin.KaraokeCdg.Api;

/// <summary>
/// CDG endpoints used by Karaoke for Jellyfin. Requires a Jellyfin API key or user token.
/// </summary>
[ApiController]
[Authorize]
[Route("Karaoke")]
public class KaraokeCdgController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly CdgVideoRenderer _renderer;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeCdgController"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="renderer">CDG video renderer.</param>
    public KaraokeCdgController(ILibraryManager libraryManager, CdgVideoRenderer renderer)
    {
        _libraryManager = libraryManager;
        _renderer = renderer;
    }

    /// <summary>
    /// Gets the raw .cdg sidecar of an audio item (option B).
    /// </summary>
    /// <param name="itemId">Audio item id.</param>
    /// <response code="200">CDG file returned.</response>
    /// <response code="404">Item not found or it has no CDG file.</response>
    /// <returns>The CDG file.</returns>
    [HttpGet("Cdg/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetCdg([FromRoute, Required] Guid itemId)
    {
        var cdgPath = FindCdg(itemId);
        return cdgPath is null
            ? NotFound()
            : PhysicalFile(cdgPath, MediaTypeNames.Application.Octet);
    }

    /// <summary>
    /// Gets the CDG graphics of an audio item pre-rendered as a silent video (option C).
    /// The first request renders and caches the video, which takes a few seconds.
    /// </summary>
    /// <param name="itemId">Audio item id.</param>
    /// <param name="format">mp4 (H.264, default) or webm (VP9, for browsers without H.264).</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">Video returned (range requests supported).</response>
    /// <response code="404">Item not found, no CDG file, or video rendering disabled.</response>
    /// <returns>The MP4 file.</returns>
    [HttpGet("Video/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult> GetVideo(
        [FromRoute, Required] Guid itemId,
        [FromQuery] CdgVideoFormat format,
        CancellationToken cancellationToken)
    {
        if (Plugin.Instance?.Configuration.EnableVideo == false)
        {
            return NotFound();
        }

        var cdgPath = FindCdg(itemId);
        if (cdgPath is null)
        {
            return NotFound();
        }

        // Let the render finish for the cache even if this client gives up waiting
        var video = await _renderer.GetOrRenderAsync(itemId, cdgPath, format).WaitAsync(cancellationToken).ConfigureAwait(false);
        return video is null
            ? StatusCode(StatusCodes.Status500InternalServerError)
            : PhysicalFile(video, CdgVideoRenderer.ContentType(format), enableRangeProcessing: true);
    }

    private string? FindCdg(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        return item is AudioItem && !string.IsNullOrEmpty(item.Path)
            ? CdgLocator.Find(item.Path)
            : null;
    }
}
