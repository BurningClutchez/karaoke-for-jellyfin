using MediaBrowser.Controller.Entities;
using AudioItem = MediaBrowser.Controller.Entities.Audio.Audio;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// The real files behind a karaoke song.
/// </summary>
/// <param name="AudioPath">Audio file to play.</param>
/// <param name="CdgPath">CDG file.</param>
/// <param name="ZipPath">The zip the files came from, or null for a .cdg next to its audio.</param>
public sealed record KaraokeFiles(string AudioPath, string CdgPath, string? ZipPath);

/// <summary>
/// Finds the audio and CDG files for an audio item, whether they sit side by side in the
/// library or the item is a placeholder for a zip (which is then extracted).
/// </summary>
public sealed class KaraokeSourceResolver
{
    private readonly PlaceholderIndex _index;
    private readonly ZipExtractionCache _extractionCache;

    /// <summary>
    /// Initializes a new instance of the <see cref="KaraokeSourceResolver"/> class.
    /// </summary>
    /// <param name="index">Zip index.</param>
    /// <param name="extractionCache">Extraction cache.</param>
    public KaraokeSourceResolver(PlaceholderIndex index, ZipExtractionCache extractionCache)
    {
        _index = index;
        _extractionCache = extractionCache;
    }

    /// <summary>
    /// Gets the karaoke zip behind a placeholder item.
    /// </summary>
    /// <param name="item">Library item.</param>
    /// <returns>The zip, or null if the item isn't a placeholder.</returns>
    public ZipRecord? FindZip(BaseItem? item) =>
        item is AudioItem && !string.IsNullOrEmpty(item.Path) && _index.FindByPlaceholder(item.Path) is { IsKaraoke: true } zip
            ? zip
            : null;

    /// <summary>
    /// Gets the real files for a karaoke song, extracting its zip if needed.
    /// </summary>
    /// <param name="item">Library item.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The files, or null if the item isn't a karaoke song.</returns>
    public async Task<KaraokeFiles?> ResolveAsync(BaseItem? item, CancellationToken cancellationToken)
    {
        if (item is not AudioItem || string.IsNullOrEmpty(item.Path))
        {
            return null;
        }

        if (FindZip(item) is { } zip)
        {
            var extracted = await _extractionCache.EnsureAsync(zip, cancellationToken).ConfigureAwait(false);
            return extracted is null ? null : new KaraokeFiles(extracted.AudioPath, extracted.CdgPath, zip.ZipPath);
        }

        return CdgLocator.Find(item.Path) is { } cdg ? new KaraokeFiles(item.Path, cdg, null) : null;
    }
}
