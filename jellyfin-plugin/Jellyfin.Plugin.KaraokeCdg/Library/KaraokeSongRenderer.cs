using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Library;

/// <summary>
/// Renders the karaoke video (graphics plus audio) for a song in the Karaoke channel,
/// extracting its zip first when it has one.
/// </summary>
public sealed class KaraokeSongRenderer
{
    private readonly CdgVideoRenderer _renderer;
    private readonly KaraokeSourceResolver _resolver;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<KaraokeSongRenderer> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeSongRenderer"/> class.
    /// </summary>
    /// <param name="renderer">Video renderer.</param>
    /// <param name="resolver">Finds a song's files.</param>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="logger">Logger.</param>
    public KaraokeSongRenderer(CdgVideoRenderer renderer, KaraokeSourceResolver resolver, ILibraryManager libraryManager, ILogger<KaraokeSongRenderer> logger)
    {
        _renderer = renderer;
        _resolver = resolver;
        _libraryManager = libraryManager;
        _logger = logger;
    }

    /// <summary>
    /// Gets the render job describing a song's karaoke video (H.264 MP4 with audio). Its cache
    /// path is known before any zip is extracted.
    /// </summary>
    /// <param name="song">The song.</param>
    /// <returns>The render job.</returns>
    public static CdgRenderJob ToJob(KaraokeSong song) =>
        new(song.Id, song.CdgPath, CdgVideoFormat.Mp4, song.AudioPath, song.ZipPath);

    /// <summary>
    /// Gets where a song's karaoke video is (or will be) cached.
    /// </summary>
    /// <param name="song">The song.</param>
    /// <returns>The cache path.</returns>
    public string GetCachePath(KaraokeSong song) => _renderer.GetCachePath(ToJob(song));

    /// <summary>
    /// Renders a song's karaoke video if it isn't cached yet.
    /// </summary>
    /// <param name="song">The song.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The video path, or null if it couldn't be rendered.</returns>
    public async Task<string?> RenderAsync(KaraokeSong song, CancellationToken cancellationToken)
    {
        var cached = GetCachePath(song);
        if (File.Exists(cached))
        {
            return cached;
        }

        var files = await _resolver.ResolveAsync(_libraryManager.GetItemById(song.Id), cancellationToken).ConfigureAwait(false);
        if (files is null)
        {
            _logger.LogError("Karaoke files for {Title} are missing", song.Title);
            return null;
        }

        // The audio comes from the resolved files (the real audio, not a placeholder)
        var job = new CdgRenderJob(song.Id, files.CdgPath, CdgVideoFormat.Mp4, files.AudioPath, files.ZipPath);
        return await _renderer.GetOrRenderAsync(job).WaitAsync(cancellationToken).ConfigureAwait(false);
    }
}
