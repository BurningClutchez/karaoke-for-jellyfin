using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.KaraokeCdg.Configuration;

/// <summary>
/// Plugin settings, stored in Jellyfin's plugin configuration folder.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether /Karaoke/Video may run ffmpeg
    /// to pre-render CDG graphics as MP4.
    /// </summary>
    public bool EnableVideo { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the "Karaoke" channel is shown in Jellyfin's apps.
    /// </summary>
    public bool EnableChannel { get; set; } = true;

    /// <summary>
    /// Gets or sets the folder for placeholder MP3s that make zipped songs searchable.
    /// Empty means "karaoke-placeholders" in Jellyfin's data folder.
    /// </summary>
    public string PlaceholderFolder { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether placeholders are written next to each zip
    /// (in the music library) instead of in the placeholder folder.
    /// </summary>
    public bool PlaceholdersNextToZips { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether a "Karaoke" music library is created for the
    /// placeholder folder when no library contains it yet.
    /// </summary>
    public bool CreateKaraokeLibrary { get; set; } = true;

    /// <summary>
    /// Gets or sets the folders searched for karaoke zips. Empty means every music library.
    /// </summary>
#pragma warning disable CA1819 // Plugin configuration is XML-serialized; arrays are the supported shape
    public string[] ZipFolders { get; set; } = [];
#pragma warning restore CA1819

    /// <summary>
    /// Gets or sets the folder zips are extracted into when a song is used.
    /// Empty means "karaoke-zips" in Jellyfin's cache folder.
    /// </summary>
    public string ExtractFolder { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets how long an extracted song is kept after it was last used, in hours.
    /// </summary>
    public int ExtractRetentionHours { get; set; } = 24;

    /// <summary>
    /// Gets or sets how many of the most recently used extracted songs are always kept.
    /// </summary>
    public int KeepRecentCount { get; set; } = 100;

    /// <summary>
    /// Gets or sets a value indicating whether zip folders are watched for new zips
    /// (takes effect after a restart; not reliable on network shares).
    /// </summary>
    public bool WatchZipFolders { get; set; }
}
