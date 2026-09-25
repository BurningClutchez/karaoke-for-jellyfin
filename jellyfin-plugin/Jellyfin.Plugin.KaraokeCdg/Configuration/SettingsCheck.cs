namespace Jellyfin.Plugin.KaraokeCdg.Configuration;

/// <summary>
/// Finds problems in the plugin settings. They're logged when settings load or change,
/// and reported by /Karaoke/Status.
/// </summary>
public static class SettingsCheck
{
    /// <summary>
    /// Lists problems in the settings.
    /// </summary>
    /// <param name="config">The settings.</param>
    /// <returns>Human-readable problems; empty when the settings are fine.</returns>
    public static IReadOnlyList<string> Warnings(PluginConfiguration? config)
    {
        if (config is null)
        {
            return [];
        }

        List<string> warnings = [];
        if (config.ExtractRetentionHours < 0)
        {
            warnings.Add($"ExtractRetentionHours is {config.ExtractRetentionHours}; negative values count as 0 (delete right away)");
        }

        if (config.KeepRecentCount < 0)
        {
            warnings.Add($"KeepRecentCount is {config.KeepRecentCount}; negative values count as 0 (keep none)");
        }

        if (config.VideoRetentionDays < 0)
        {
            warnings.Add($"VideoRetentionDays is {config.VideoRetentionDays}; negative values count as 0 (keep forever)");
        }

        if (config.KeepRecentVideos < 0)
        {
            warnings.Add($"KeepRecentVideos is {config.KeepRecentVideos}; negative values count as 0 (keep none)");
        }

        warnings.AddRange(config.ZipFolders
            .Where(folder => !string.IsNullOrWhiteSpace(folder) && !Directory.Exists(folder))
            .Select(folder => $"Zip folder {folder} does not exist"));

        if (!string.IsNullOrWhiteSpace(config.ExtractFolder)
            && config.ZipFolders.Any(folder => IsInside(config.ExtractFolder, folder)))
        {
            warnings.Add($"ExtractFolder {config.ExtractFolder} is inside a zip folder; extracted files would be scanned as music");
        }

        return warnings;
    }

    private static bool IsInside(string path, string folder) =>
        !string.IsNullOrWhiteSpace(folder)
        && Zips.ZipNaming.IsInside(path, folder);
}
