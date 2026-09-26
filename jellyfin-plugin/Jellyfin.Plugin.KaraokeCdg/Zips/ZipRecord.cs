namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// What the plugin knows about one zip it has looked at.
/// </summary>
public sealed class ZipRecord
{
    /// <summary>Gets or sets the zip file path.</summary>
    public string ZipPath { get; set; } = string.Empty;

    /// <summary>Gets or sets the zip folder (library root) the zip was found under.</summary>
    public string ZipRoot { get; set; } = string.Empty;

    /// <summary>Gets or sets the zip size when it was inspected.</summary>
    public long ZipSize { get; set; }

    /// <summary>Gets or sets the zip modification time (UTC ticks) when it was inspected.</summary>
    public long ZipModifiedTicks { get; set; }

    /// <summary>Gets or sets the placeholder MP3, or null if the zip isn't a karaoke zip.</summary>
    public string? PlaceholderPath { get; set; }

    /// <summary>Gets or sets the audio entry name.</summary>
    public string? AudioEntry { get; set; }

    /// <summary>Gets or sets the CDG entry name.</summary>
    public string? CdgEntry { get; set; }

    /// <summary>
    /// Gets a value indicating whether this zip holds a playable karaoke song.
    /// </summary>
    public bool IsKaraoke => PlaceholderPath is not null && AudioEntry is not null && CdgEntry is not null;

    /// <summary>
    /// Checks whether the zip on disk is unchanged since it was inspected.
    /// </summary>
    /// <param name="size">Current size.</param>
    /// <param name="modifiedTicks">Current modification time (UTC ticks).</param>
    /// <returns>True if unchanged.</returns>
    public bool Matches(long size, long modifiedTicks) => ZipSize == size && ZipModifiedTicks == modifiedTicks;
}
