using System.Globalization;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Channels;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Channels;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Library;

/// <summary>
/// A "Karaoke" channel in Jellyfin's own apps. Every song with a .cdg file appears as a video
/// (grouped by artist) that plays the CD+G graphics together with the song's audio.
/// The video is rendered on first play, or ahead of time by the "Render karaoke videos" task.
/// </summary>
public class KaraokeChannel : IChannel, IRequiresMediaInfoCallback, IHasCacheKey
{
    private const string ArtistFolderPrefix = "artist:";
    private readonly KaraokeLibraryIndex _index;
    private readonly CdgVideoRenderer _renderer;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<KaraokeChannel> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeChannel"/> class.
    /// </summary>
    /// <param name="index">Karaoke song index.</param>
    /// <param name="renderer">Video renderer.</param>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="userManager">User manager.</param>
    /// <param name="logger">Logger.</param>
    public KaraokeChannel(
        KaraokeLibraryIndex index,
        CdgVideoRenderer renderer,
        ILibraryManager libraryManager,
        IUserManager userManager,
        ILogger<KaraokeChannel> logger)
    {
        _index = index;
        _renderer = renderer;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _logger = logger;
    }

    /// <inheritdoc />
    public string Name => "Karaoke";

    /// <inheritdoc />
    public string Description => "Songs with CD+G karaoke graphics, played as videos.";

    /// <inheritdoc />
    public string DataVersion => _index.GetVersion();

    /// <inheritdoc />
    public string HomePageUrl => string.Empty;

    /// <inheritdoc />
    public ChannelParentalRating ParentalRating => ChannelParentalRating.GeneralAudience;

    /// <inheritdoc />
    public InternalChannelFeatures GetChannelFeatures() => new()
    {
        MediaTypes = [ChannelMediaType.Video],
        ContentTypes = [ChannelMediaContentType.Song],
    };

    /// <inheritdoc />
    public bool IsEnabledFor(string userId) => Plugin.Instance?.Configuration.EnableChannel != false;

    /// <inheritdoc />
    public string GetCacheKey(string? userId) => userId ?? string.Empty;

    /// <inheritdoc />
    public Task<DynamicImageResponse> GetChannelImage(ImageType type, CancellationToken cancellationToken) =>
        Task.FromResult(new DynamicImageResponse { HasImage = false });

    /// <inheritdoc />
    public IEnumerable<ImageType> GetSupportedChannelImages() => [];

    /// <inheritdoc />
    public Task<ChannelItemResult> GetChannelItems(InternalChannelItemQuery query, CancellationToken cancellationToken)
    {
        var songs = VisibleSongs(query.UserId);
        var items = string.IsNullOrEmpty(query.FolderId)
            ? ArtistFolders(songs)
            : SongItems(songs, query.FolderId);
        return Task.FromResult(new ChannelItemResult { Items = items, TotalRecordCount = items.Count });
    }

    /// <summary>
    /// Called by Jellyfin when a song is about to play: makes sure its video is rendered.
    /// The media source itself was already given with the channel item.
    /// </summary>
    /// <param name="id">Channel item id (the audio item id).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>No extra media sources.</returns>
    public async Task<IEnumerable<MediaSourceInfo>> GetChannelItemMediaInfo(string id, CancellationToken cancellationToken)
    {
        if (Guid.TryParse(id, out var songId) && _index.Find(songId) is { } song)
        {
            var video = await _renderer.GetOrRenderAsync(ToJob(song)).WaitAsync(cancellationToken).ConfigureAwait(false);
            if (video is null)
            {
                _logger.LogError("Karaoke video for {Title} could not be rendered", song.Title);
            }
        }

        return [];
    }

    /// <summary>
    /// Gets the render job for a song's karaoke video (graphics and audio, H.264 MP4).
    /// </summary>
    /// <param name="song">The song.</param>
    /// <returns>The render job.</returns>
    public static CdgRenderJob ToJob(KaraokeSong song) =>
        new(song.Id, song.CdgPath, CdgVideoFormat.Mp4, song.AudioPath);

    /// <summary>
    /// Groups songs into one folder per artist.
    /// </summary>
    /// <param name="songs">Songs, sorted by artist.</param>
    /// <returns>Artist folders.</returns>
    public static List<ChannelItemInfo> ArtistFolders(IEnumerable<KaraokeSong> songs) =>
        songs
            .GroupBy(song => song.Artist, StringComparer.OrdinalIgnoreCase)
            .Select(group => new ChannelItemInfo
            {
                Id = ArtistFolderPrefix + group.Key.ToLowerInvariant(),
                Name = group.First().Artist,
                Type = ChannelItemType.Folder,
                FolderType = ChannelFolderType.Container,
                ImageUrl = group.Select(song => song.ImagePath).FirstOrDefault(path => path is not null),
                DateModified = group.Max(song => song.DateModified),
            })
            .ToList();

    private List<ChannelItemInfo> SongItems(IEnumerable<KaraokeSong> songs, string folderId)
    {
        var artist = folderId.StartsWith(ArtistFolderPrefix, StringComparison.Ordinal)
            ? folderId[ArtistFolderPrefix.Length..]
            : folderId;
        var items = new List<ChannelItemInfo>();
        foreach (var song in songs.Where(song => string.Equals(song.Artist, artist, StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                items.Add(ToItem(song, _renderer.GetCachePath(ToJob(song))));
            }
            catch (IOException ex)
            {
                // The file went away since the index was built
                _logger.LogWarning(ex, "Skipping karaoke song {Path}", song.AudioPath);
            }
        }

        return items;
    }

    /// <summary>
    /// Builds the channel item for a song.
    /// </summary>
    /// <param name="song">The song.</param>
    /// <param name="videoPath">Where its karaoke video is cached.</param>
    /// <returns>The channel item.</returns>
    public static ChannelItemInfo ToItem(KaraokeSong song, string videoPath) => new()
    {
        Id = song.Id.ToString("N", CultureInfo.InvariantCulture),
        Name = song.Title,
        Overview = song.Artist,
        Type = ChannelItemType.Media,
        MediaType = ChannelMediaType.Video,
        ContentType = ChannelMediaContentType.Song,
        RunTimeTicks = song.RunTimeTicks,
        ImageUrl = song.ImagePath,
        DateModified = song.DateModified,
        Artists = [song.Artist],
        MediaSources = [KaraokeMediaSource.Create(song, videoPath)],
    };

    private IEnumerable<KaraokeSong> VisibleSongs(Guid userId)
    {
        var songs = _index.GetSongs();
        var user = userId.Equals(Guid.Empty) ? null : _userManager.GetUserById(userId);
        return user is null ? songs : songs.Where(song => IsVisible(song, user));
    }

    private bool IsVisible(KaraokeSong song, User user) =>
        _libraryManager.GetItemById(song.Id)?.IsVisibleStandalone(user) == true;
}
