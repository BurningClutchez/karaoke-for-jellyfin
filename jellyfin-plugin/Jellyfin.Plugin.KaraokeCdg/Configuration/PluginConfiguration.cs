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
}
