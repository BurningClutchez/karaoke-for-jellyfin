using System.ComponentModel.DataAnnotations;
using System.Net.Mime;
using Jellyfin.Plugin.KaraokeCdg.Configuration;
using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.MediaEncoding;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.KaraokeCdg.Api;

/// <summary>
/// Whether an item is a karaoke song and where its files come from.
/// </summary>
/// <param name="ZipBacked">True if the item is a placeholder whose song is in a zip.</param>
/// <param name="HasCdg">True if the item has CD+G graphics.</param>
public sealed record KaraokePrepareResult(bool ZipBacked, bool HasCdg);

/// <summary>
/// Plugin status, for health checks.
/// </summary>
/// <param name="Version">Plugin version.</param>
/// <param name="FfmpegFound">Whether Jellyfin's ffmpeg exists.</param>
/// <param name="Placeholders">Number of zipped songs with placeholders.</param>
/// <param name="ExtractedSongs">Number of zipped songs currently extracted.</param>
/// <param name="SettingsWarnings">Problems found in the plugin settings.</param>
public sealed record KaraokeStatus(
    string Version,
    bool FfmpegFound,
    int Placeholders,
    int ExtractedSongs,
    IReadOnlyList<string> SettingsWarnings);

/// <summary>
/// CDG endpoints used by Karaoke for Jellyfin. Requires a Jellyfin API key or user token.
/// </summary>
[ApiController]
[Authorize]
[Route("Karaoke")]
public class KaraokeCdgController : ControllerBase
{
    private static readonly Dictionary<string, string> AudioMimeTypes = new(StringComparer.Ordinal)
    {
        [".mp3"] = "audio/mpeg",
        [".m4a"] = "audio/mp4",
        [".aac"] = "audio/aac",
        [".ogg"] = "audio/ogg",
        [".opus"] = "audio/ogg",
        [".flac"] = "audio/flac",
        [".wav"] = "audio/wav",
        [".wma"] = "audio/x-ms-wma",
    };

    private readonly ILibraryManager _libraryManager;
    private readonly CdgVideoRenderer _renderer;
    private readonly KaraokeSourceResolver _resolver;
    private readonly PlaceholderIndex _placeholders;
    private readonly ZipExtractionCache _extractionCache;
    private readonly IMediaEncoder _mediaEncoder;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeCdgController"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="renderer">CDG video renderer.</param>
    /// <param name="resolver">Finds the files behind a karaoke song.</param>
    /// <param name="placeholders">Zip placeholder index.</param>
    /// <param name="extractionCache">Extraction cache.</param>
    /// <param name="mediaEncoder">Provides the ffmpeg path.</param>
    public KaraokeCdgController(
        ILibraryManager libraryManager,
        CdgVideoRenderer renderer,
        KaraokeSourceResolver resolver,
        PlaceholderIndex placeholders,
        ZipExtractionCache extractionCache,
        IMediaEncoder mediaEncoder)
    {
        _libraryManager = libraryManager;
        _renderer = renderer;
        _resolver = resolver;
        _placeholders = placeholders;
        _extractionCache = extractionCache;
        _mediaEncoder = mediaEncoder;
    }

    /// <summary>
    /// Gets the plugin's status, used by Karaoke for Jellyfin's health check.
    /// </summary>
    /// <response code="200">Status returned.</response>
    /// <returns>The status.</returns>
    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<KaraokeStatus> GetStatus()
    {
        var extracted = Directory.Exists(_extractionCache.Root)
            ? Directory.EnumerateDirectories(_extractionCache.Root)
                .Count(folder => ZipExtractionCache.IsCacheFolderName(Path.GetFileName(folder)))
            : 0;
        return new KaraokeStatus(
            Plugin.Instance?.Version.ToString() ?? "unknown",
            !string.IsNullOrEmpty(_mediaEncoder.EncoderPath) && System.IO.File.Exists(_mediaEncoder.EncoderPath),
            _placeholders.All().Count(record => record.IsKaraoke),
            extracted,
            SettingsCheck.Warnings(Plugin.Instance?.Configuration));
    }

    /// <summary>
    /// Gets the raw .cdg file of an audio item (option B): the sidecar next to the audio,
    /// or the one inside the zip behind a placeholder.
    /// </summary>
    /// <param name="itemId">Audio item id.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">CDG file returned.</response>
    /// <response code="404">Item not found or it has no CDG file.</response>
    /// <returns>The CDG file.</returns>
    [HttpGet("Cdg/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetCdg([FromRoute, Required] Guid itemId, CancellationToken cancellationToken)
    {
        var files = await ResolveAsync(itemId, cancellationToken).ConfigureAwait(false);
        return files is null
            ? NotFound()
            : PhysicalFile(files.CdgPath, MediaTypeNames.Application.Octet);
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
    /// <returns>The video file.</returns>
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

        // A zipped song's video is named after the zip, so a cached one can be served without
        // extracting the zip first
        var item = _libraryManager.GetItemById(itemId);
        if (_resolver.FindZip(item) is { } zip)
        {
            var cached = _renderer.GetCachePath(new CdgRenderJob(itemId, string.Empty, format, SourcePath: zip.ZipPath));
            if (System.IO.File.Exists(cached))
            {
                _renderer.MarkUsed(cached);
                return PhysicalFile(cached, CdgVideoRenderer.ContentType(format), enableRangeProcessing: true);
            }
        }

        var files = await _resolver.ResolveAsync(item, cancellationToken).ConfigureAwait(false);
        if (files is null)
        {
            return NotFound();
        }

        // Let the render finish for the cache even if this client gives up waiting
        var job = new CdgRenderJob(itemId, files.CdgPath, format, SourcePath: files.ZipPath);
        var video = await _renderer.GetOrRenderAsync(job).WaitAsync(cancellationToken).ConfigureAwait(false);
        return video is null
            ? StatusCode(StatusCodes.Status500InternalServerError)
            : PhysicalFile(video, CdgVideoRenderer.ContentType(format), enableRangeProcessing: true);
    }

    /// <summary>
    /// Readies a song before it plays: extracts a zipped song into the temporary folder
    /// (and marks it recently used). Karaoke for Jellyfin calls this when a song is queued.
    /// </summary>
    /// <param name="itemId">Audio item id.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">Whether the song is zip-backed and has graphics.</response>
    /// <response code="404">Item not found.</response>
    /// <returns>The result.</returns>
    [HttpGet("Prepare/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<KaraokePrepareResult>> Prepare([FromRoute, Required] Guid itemId, CancellationToken cancellationToken)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null)
        {
            return NotFound();
        }

        var files = await _resolver.ResolveAsync(item, cancellationToken).ConfigureAwait(false);
        return new KaraokePrepareResult(_resolver.FindZip(item) is not null, files is not null);
    }

    /// <summary>
    /// Gets the real audio of a zip-backed song (the library item itself is a silent placeholder).
    /// </summary>
    /// <param name="itemId">Placeholder item id.</param>
    /// <param name="cancellationToken">Request cancellation.</param>
    /// <response code="200">Audio returned (range requests supported).</response>
    /// <response code="404">Item not found or not a zip-backed song.</response>
    /// <returns>The audio file.</returns>
    [HttpGet("Audio/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetAudio([FromRoute, Required] Guid itemId, CancellationToken cancellationToken)
    {
        var files = await ResolveAsync(itemId, cancellationToken).ConfigureAwait(false);
        if (files?.ZipPath is null)
        {
            return NotFound();
        }

        var mime = AudioMimeTypes.GetValueOrDefault(Path.GetExtension(files.AudioPath), MediaTypeNames.Application.Octet);
        return PhysicalFile(files.AudioPath, mime, enableRangeProcessing: true);
    }

    private Task<KaraokeFiles?> ResolveAsync(Guid itemId, CancellationToken cancellationToken) =>
        _resolver.ResolveAsync(_libraryManager.GetItemById(itemId), cancellationToken);
}
