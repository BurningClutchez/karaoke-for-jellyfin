using System.Globalization;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Jellyfin.Plugin.KaraokeCdg.Zips;
using AudioItem = MediaBrowser.Controller.Entities.Audio.Audio;

namespace Jellyfin.Plugin.KaraokeCdg.Library;

/// <summary>
/// An audio item that has a .cdg file next to it.
/// </summary>
/// <param name="Id">Audio item id.</param>
/// <param name="Title">Song title.</param>
/// <param name="Artist">Main artist.</param>
/// <param name="AudioPath">Audio file path.</param>
/// <param name="CdgPath">CDG file path.</param>
/// <param name="RunTimeTicks">Duration of the audio.</param>
/// <param name="ImagePath">Cover art path, if any.</param>
/// <param name="DateModified">Latest change to the audio or CDG file.</param>
/// <param name="ZipPath">The zip holding the song, when the audio item is a placeholder.</param>
public sealed record KaraokeSong(
    Guid Id,
    string Title,
    string Artist,
    string AudioPath,
    string CdgPath,
    long? RunTimeTicks,
    string? ImagePath,
    DateTime DateModified,
    string? ZipPath = null);

/// <summary>
/// Finds the library's audio items that have CDG graphics. The scan lists each music folder
/// once rather than checking every song, and the result is kept for a few minutes.
/// </summary>
public sealed class KaraokeLibraryIndex
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(10);
    private readonly ILibraryManager _libraryManager;
    private readonly PlaceholderIndex _placeholders;
    private readonly Lock _lock = new();
    private IReadOnlyList<KaraokeSong> _songs = [];
    private Dictionary<Guid, KaraokeSong> _byId = [];
    private DateTime _builtAt = DateTime.MinValue;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeLibraryIndex"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="placeholders">Zip placeholders.</param>
    public KaraokeLibraryIndex(ILibraryManager libraryManager, PlaceholderIndex placeholders)
    {
        _libraryManager = libraryManager;
        _placeholders = placeholders;
    }

    /// <summary>
    /// Gets all karaoke songs, sorted by artist then title.
    /// </summary>
    /// <returns>The songs.</returns>
    public IReadOnlyList<KaraokeSong> GetSongs()
    {
        lock (_lock)
        {
            if (DateTime.UtcNow - _builtAt > CacheLifetime)
            {
                var audioItems = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = [BaseItemKind.Audio],
                    Recursive = true,
                    IsVirtualItem = false,
                });
                _songs = Build(audioItems.OfType<AudioItem>().Select(ToCandidate), ListCdgFiles, _placeholders.FindByPlaceholder);
                _byId = _songs.ToDictionary(song => song.Id);
                _builtAt = DateTime.UtcNow;
            }

            return _songs;
        }
    }

    /// <summary>
    /// Finds a karaoke song by its audio item id.
    /// </summary>
    /// <param name="id">Audio item id.</param>
    /// <returns>The song, or null.</returns>
    public KaraokeSong? Find(Guid id)
    {
        GetSongs();
        lock (_lock)
        {
            return _byId.GetValueOrDefault(id);
        }
    }

    /// <summary>
    /// Forces the next lookup to rescan the library.
    /// </summary>
    public void Invalidate()
    {
        lock (_lock)
        {
            _builtAt = DateTime.MinValue;
        }
    }

    /// <summary>
    /// Matches audio files to CDG files in the same folder with the same name.
    /// The extension may be any case (.cdg, .CDG).
    /// </summary>
    /// <param name="candidates">Audio items to consider.</param>
    /// <param name="listFiles">Lists the files in a folder.</param>
    /// <param name="findZip">Finds the zip behind a placeholder path, if any.</param>
    /// <returns>The songs that have CDG graphics, sorted by artist then title.</returns>
    public static IReadOnlyList<KaraokeSong> Build(
        IEnumerable<KaraokeSong> candidates,
        Func<string, IEnumerable<string>> listFiles,
        Func<string, ZipRecord?>? findZip = null)
    {
        var folders = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        var songs = new List<KaraokeSong>();

        foreach (var candidate in candidates)
        {
            if (findZip?.Invoke(candidate.AudioPath) is { IsKaraoke: true } zip)
            {
                var zipModified = new DateTime(zip.ZipModifiedTicks, DateTimeKind.Utc);
                songs.Add(candidate with
                {
                    ZipPath = zip.ZipPath,
                    DateModified = zipModified > candidate.DateModified ? zipModified : candidate.DateModified,
                });
                continue;
            }

            var folder = Path.GetDirectoryName(candidate.AudioPath);
            if (string.IsNullOrEmpty(folder))
            {
                continue;
            }

            if (!folders.TryGetValue(folder, out var cdgByName))
            {
                cdgByName = listFiles(folder)
                    .Where(file => string.Equals(Path.GetExtension(file), ".cdg", StringComparison.OrdinalIgnoreCase))
                    .GroupBy(Path.GetFileNameWithoutExtension, StringComparer.Ordinal)
                    .ToDictionary(group => group.Key!, group => group.First(), StringComparer.Ordinal);
                folders[folder] = cdgByName;
            }

            if (cdgByName.TryGetValue(Path.GetFileNameWithoutExtension(candidate.AudioPath), out var cdgPath))
            {
                var cdgModified = File.Exists(cdgPath) ? File.GetLastWriteTimeUtc(cdgPath) : DateTime.MinValue;
                songs.Add(candidate with
                {
                    CdgPath = cdgPath,
                    DateModified = cdgModified > candidate.DateModified ? cdgModified : candidate.DateModified,
                });
            }
        }

        return songs
            .OrderBy(song => song.Artist, StringComparer.OrdinalIgnoreCase)
            .ThenBy(song => song.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static KaraokeSong ToCandidate(AudioItem item)
    {
        var artist = item.AlbumArtists.FirstOrDefault()
            ?? item.Artists.FirstOrDefault()
            ?? "Unknown Artist";
        var image = item.GetImageInfo(ImageType.Primary, 0)?.Path
            ?? item.AlbumEntity?.GetImageInfo(ImageType.Primary, 0)?.Path;
        return new KaraokeSong(
            item.Id,
            string.IsNullOrWhiteSpace(item.Name) ? Path.GetFileNameWithoutExtension(item.Path) : item.Name,
            artist,
            item.Path,
            string.Empty,
            item.RunTimeTicks,
            image,
            item.DateModified);
    }

    private static IEnumerable<string> ListCdgFiles(string folder)
    {
        try
        {
            return Directory.EnumerateFiles(folder).ToList();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    /// <summary>
    /// Gets a short fingerprint of the index, used as the channel's data version.
    /// </summary>
    /// <returns>A version string that changes when songs are added, removed or edited.</returns>
    public string GetVersion()
    {
        var songs = GetSongs();
        var latest = songs.Count == 0 ? 0 : songs.Max(song => song.DateModified.Ticks);
        return string.Create(CultureInfo.InvariantCulture, $"{songs.Count}-{latest}");
    }
}
