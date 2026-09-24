using System.IO.Compression;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// The two files inside a karaoke zip.
/// </summary>
/// <param name="AudioEntry">Zip entry name of the audio file.</param>
/// <param name="CdgEntry">Zip entry name of the CDG file.</param>
public sealed record KaraokeZipContents(string AudioEntry, string CdgEntry);

/// <summary>
/// Reads karaoke zips: exactly one .cdg file and one audio file.
/// </summary>
public static class KaraokeZip
{
    /// <summary>
    /// Largest entry that will be extracted (guards against zip bombs).
    /// </summary>
    public const long MaxEntryBytes = 500L * 1024 * 1024;

    private static readonly string[] AudioExtensions = [".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".wav", ".wma"];

    /// <summary>
    /// Opens a zip and checks whether it is a karaoke zip.
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    /// <returns>The entries to use, or null if it isn't a karaoke zip.</returns>
    public static KaraokeZipContents? Inspect(string zipPath)
    {
        using var archive = ZipFile.OpenRead(zipPath);
        return Inspect(archive.Entries.Select(entry => (entry.FullName, entry.Length)));
    }

    /// <summary>
    /// Picks the audio and CDG entries from a zip's file list. Folders, macOS metadata
    /// ("__MACOSX/", "._name") and empty files are ignored.
    /// </summary>
    /// <param name="entries">Entry names and uncompressed sizes.</param>
    /// <returns>The entries to use, or null unless there is exactly one of each.</returns>
    public static KaraokeZipContents? Inspect(IEnumerable<(string Name, long Length)> entries)
    {
        var files = entries.Where(entry => entry.Length > 0 && !IsJunk(entry.Name)).ToList();
        var cdg = files.Where(entry => HasExtension(entry.Name, ".cdg")).ToList();
        var audio = files.Where(entry => AudioExtensions.Any(extension => HasExtension(entry.Name, extension))).ToList();
        if (cdg.Count != 1 || audio.Count != 1 || cdg[0].Length > MaxEntryBytes || audio[0].Length > MaxEntryBytes)
        {
            return null;
        }

        return new KaraokeZipContents(audio[0].Name, cdg[0].Name);
    }

    /// <summary>
    /// Extracts one entry to a file of our choosing (entry paths are never used as
    /// destinations, so a crafted zip can't write elsewhere).
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    /// <param name="entryName">Entry to extract.</param>
    /// <param name="destination">Destination file.</param>
    public static void ExtractEntry(string zipPath, string entryName, string destination)
    {
        using var archive = ZipFile.OpenRead(zipPath);
        var entry = archive.GetEntry(entryName)
            ?? throw new FileNotFoundException($"{entryName} is missing from {zipPath}");
        var temp = destination + ".partial";
        using (var input = entry.Open())
        using (var output = File.Create(temp))
        {
            CopyLimited(input, output, MaxEntryBytes);
        }

        File.Move(temp, destination, overwrite: true);
    }

    /// <summary>
    /// Gets the audio file extension of an entry, lower case.
    /// </summary>
    /// <param name="entryName">Entry name.</param>
    /// <returns>The extension, e.g. ".mp3".</returns>
    public static string AudioExtension(string entryName) =>
        Path.GetExtension(entryName).ToLowerInvariant();

    private static bool HasExtension(string name, string extension) =>
        name.EndsWith(extension, StringComparison.OrdinalIgnoreCase);

    private static bool IsJunk(string name) =>
        name.EndsWith('/')
        || name.StartsWith("__MACOSX/", StringComparison.Ordinal)
        || Path.GetFileName(name).StartsWith("._", StringComparison.Ordinal);

    private static void CopyLimited(Stream input, Stream output, long limit)
    {
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            total += read;
            if (total > limit)
            {
                throw new InvalidDataException("Zip entry is larger than it claims");
            }

            output.Write(buffer, 0, read);
        }
    }
}
