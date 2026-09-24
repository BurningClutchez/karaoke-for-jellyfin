using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Names derived from a zip's path.
/// </summary>
public static class ZipNaming
{
    /// <summary>
    /// Guesses artist and title from a karaoke file name, for zips whose audio has no tags.
    /// Handles "Artist - Title" and "DISC-01 - Artist - Title".
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    /// <returns>Artist (or null) and title.</returns>
    public static (string? Artist, string Title) ParseName(string zipPath)
    {
        var name = Path.GetFileNameWithoutExtension(zipPath);
        var parts = name.Split(" - ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            >= 3 => (parts[^2], parts[^1]),
            2 => (parts[0], parts[1]),
            _ => (null, name.Trim()),
        };
    }

    /// <summary>
    /// Where a zip's placeholder goes: next to the zip, or in the placeholder folder under a
    /// subfolder per zip root that mirrors the zip's relative location.
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    /// <param name="zipRoot">Zip folder the zip was found under.</param>
    /// <param name="placeholderRoot">Placeholder folder, or null to put placeholders next to zips.</param>
    /// <returns>The placeholder path.</returns>
    public static string PlaceholderPath(string zipPath, string zipRoot, string? placeholderRoot)
    {
        if (placeholderRoot is null)
        {
            return Path.ChangeExtension(zipPath, ".mp3");
        }

        var relative = Path.ChangeExtension(Path.GetRelativePath(zipRoot, zipPath), ".mp3");
        return Path.Combine(placeholderRoot, RootFolderName(zipRoot), relative);
    }

    /// <summary>
    /// A stable, readable folder name for a zip root, e.g. "Karaoke-1a2b3c4d".
    /// </summary>
    /// <param name="zipRoot">Zip folder.</param>
    /// <returns>The folder name.</returns>
    public static string RootFolderName(string zipRoot)
    {
        var trimmed = Path.TrimEndingDirectorySeparator(zipRoot);
        var name = Path.GetFileName(trimmed);
        var safe = new string(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "root-" + ShortHash(trimmed) : $"{safe}-{ShortHash(trimmed)}";
    }

    /// <summary>
    /// A short hex hash of a string.
    /// </summary>
    /// <param name="value">The string.</param>
    /// <returns>Eight hex characters.</returns>
    public static string ShortHash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)))[..8].ToLower(CultureInfo.InvariantCulture);

    /// <summary>
    /// Checks whether a path is the given folder or inside it.
    /// </summary>
    /// <param name="path">Path to check.</param>
    /// <param name="folder">Folder.</param>
    /// <returns>True if inside.</returns>
    public static bool IsInside(string path, string folder)
    {
        var full = Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder));
        return full.Equals(root, StringComparison.Ordinal)
            || full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal);
    }
}
