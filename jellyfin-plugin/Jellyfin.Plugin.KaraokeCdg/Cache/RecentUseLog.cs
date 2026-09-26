using System.Text.Json;

namespace Jellyfin.Plugin.KaraokeCdg.Cache;

/// <summary>
/// The most recently used entries of a cache folder, newest first, kept in
/// <c>recent.json</c> inside that folder. Entries on the list survive cleanup.
/// </summary>
public sealed class RecentUseLog
{
    private const string FileName = "recent.json";
    private readonly Func<string> _folder;
    private readonly Lock _lock = new();

    /// <summary>
    /// Initializes a new instance of the <see cref="RecentUseLog"/> class.
    /// </summary>
    /// <param name="folder">Returns the cache folder (it can change with the settings).</param>
    public RecentUseLog(Func<string> folder)
    {
        _folder = folder;
    }

    /// <summary>
    /// Gets the entries, most recently used first.
    /// </summary>
    /// <returns>The entry names.</returns>
    public IReadOnlyList<string> Read()
    {
        lock (_lock)
        {
            return ReadUnlocked();
        }
    }

    /// <summary>
    /// Moves an entry to the front of the list, keeping at most <paramref name="limit"/> entries.
    /// </summary>
    /// <param name="name">Entry name.</param>
    /// <param name="limit">How many entries to keep.</param>
    public void MarkUsed(string name, int limit)
    {
        lock (_lock)
        {
            var recent = ReadUnlocked().Where(entry => entry != name).Prepend(name).Take(Math.Max(limit, 0)).ToList();
            var path = Path.Combine(_folder(), FileName);
            try
            {
                Directory.CreateDirectory(_folder());
                File.WriteAllText(path + ".partial", JsonSerializer.Serialize(recent));
                File.Move(path + ".partial", path, overwrite: true);
            }
            catch (IOException)
            {
                // The list is only a hint for cleanup; the next use writes it again
            }
        }
    }

    private List<string> ReadUnlocked()
    {
        try
        {
            var path = Path.Combine(_folder(), FileName);
            return File.Exists(path)
                ? JsonSerializer.Deserialize<List<string>>(File.ReadAllText(path)) ?? []
                : [];
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            return [];
        }
    }
}
