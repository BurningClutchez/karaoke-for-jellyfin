using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Remembers every zip the plugin has inspected and the placeholder it made, saved as JSON
/// in Jellyfin's data folder. Lets later scans skip unchanged zips and maps a placeholder
/// (a Jellyfin audio item) back to its zip.
/// </summary>
public sealed class PlaceholderIndex
{
    private readonly string _path;
    private readonly ILogger<PlaceholderIndex> _logger;
    private readonly Lock _lock = new();
    private Dictionary<string, ZipRecord>? _byZip;
    private Dictionary<string, ZipRecord> _byPlaceholder = new(StringComparer.Ordinal);

    /// <summary>
    /// Initializes a new instance of the <see cref="PlaceholderIndex"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin paths.</param>
    /// <param name="logger">Logger.</param>
    public PlaceholderIndex(IApplicationPaths applicationPaths, ILogger<PlaceholderIndex> logger)
        : this(Path.Combine(applicationPaths.DataPath, "karaoke", "zips.json"), logger)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="PlaceholderIndex"/> class.
    /// </summary>
    /// <param name="path">JSON file to load from and save to.</param>
    /// <param name="logger">Logger.</param>
    public PlaceholderIndex(string path, ILogger<PlaceholderIndex> logger)
    {
        _path = path;
        _logger = logger;
    }

    /// <summary>
    /// Finds the record for a zip.
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    /// <returns>The record, or null.</returns>
    public ZipRecord? FindByZip(string zipPath)
    {
        lock (_lock)
        {
            return Load().GetValueOrDefault(zipPath);
        }
    }

    /// <summary>
    /// Finds the karaoke zip behind a placeholder.
    /// </summary>
    /// <param name="placeholderPath">Path of a Jellyfin audio item.</param>
    /// <returns>The record, or null if the path isn't a placeholder.</returns>
    public ZipRecord? FindByPlaceholder(string placeholderPath)
    {
        lock (_lock)
        {
            Load();
            return _byPlaceholder.GetValueOrDefault(placeholderPath);
        }
    }

    /// <summary>
    /// Gets a snapshot of all records.
    /// </summary>
    /// <returns>The records.</returns>
    public IReadOnlyList<ZipRecord> All()
    {
        lock (_lock)
        {
            return Load().Values.ToList();
        }
    }

    /// <summary>
    /// Adds or replaces a record.
    /// </summary>
    /// <param name="record">The record.</param>
    public void Upsert(ZipRecord record)
    {
        lock (_lock)
        {
            Remove(record.ZipPath);
            Load()[record.ZipPath] = record;
            if (record.PlaceholderPath is not null)
            {
                _byPlaceholder[record.PlaceholderPath] = record;
            }
        }
    }

    /// <summary>
    /// Removes a zip's record.
    /// </summary>
    /// <param name="zipPath">Zip file path.</param>
    public void Remove(string zipPath)
    {
        lock (_lock)
        {
            if (Load().Remove(zipPath, out var old) && old.PlaceholderPath is not null)
            {
                _byPlaceholder.Remove(old.PlaceholderPath);
            }
        }
    }

    /// <summary>
    /// Writes the index to disk.
    /// </summary>
    public void Save()
    {
        lock (_lock)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var temp = _path + ".partial";
            File.WriteAllText(temp, JsonSerializer.Serialize(Load().Values.ToList()));
            File.Move(temp, _path, overwrite: true);
        }
    }

    private Dictionary<string, ZipRecord> Load()
    {
        if (_byZip is not null)
        {
            return _byZip;
        }

        List<ZipRecord> records = [];
        try
        {
            if (File.Exists(_path))
            {
                records = JsonSerializer.Deserialize<List<ZipRecord>>(File.ReadAllText(_path)) ?? [];
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            // Rebuilt by the next scan
            _logger.LogWarning(ex, "Could not read {Path}; zips will be inspected again", _path);
        }

        _byZip = records.ToDictionary(record => record.ZipPath, StringComparer.Ordinal);
        _byPlaceholder = records
            .Where(record => record.PlaceholderPath is not null)
            .ToDictionary(record => record.PlaceholderPath!, StringComparer.Ordinal);
        return _byZip;
    }
}
