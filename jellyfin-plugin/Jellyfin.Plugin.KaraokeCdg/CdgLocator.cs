namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// Finds the .cdg sidecar that belongs to an audio file.
/// </summary>
public static class CdgLocator
{
    private static readonly string[] Extensions = [".cdg", ".CDG", ".Cdg"];

    /// <summary>
    /// Returns the path of the CDG file next to <paramref name="audioPath"/>, or null if there is none.
    /// </summary>
    /// <param name="audioPath">Full path of the audio file.</param>
    /// <returns>The sidecar path, or null.</returns>
    public static string? Find(string audioPath)
    {
        var directory = Path.GetDirectoryName(audioPath);
        if (string.IsNullOrEmpty(directory))
        {
            return null;
        }

        var name = Path.GetFileNameWithoutExtension(audioPath);
        return Extensions
            .Select(extension => Path.Combine(directory, name + extension))
            .FirstOrDefault(File.Exists);
    }
}
