using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Configuration;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.IO;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Keeps placeholders in step with the karaoke zips: makes placeholders for new or changed
/// zips, removes them for deleted zips, then refreshes the affected library folders.
/// </summary>
public sealed class PlaceholderSync
{
    private const string LibraryName = "Karaoke";
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ILibraryManager _libraryManager;
    private readonly IApplicationPaths _applicationPaths;
    private readonly IFileSystem _fileSystem;
    private readonly PlaceholderIndex _index;
    private readonly PlaceholderWriter _writer;
    private readonly ZipExtractionCache _extractionCache;
    private readonly ILogger<PlaceholderSync> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="PlaceholderSync"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager.</param>
    /// <param name="applicationPaths">Jellyfin paths.</param>
    /// <param name="fileSystem">File system.</param>
    /// <param name="index">Zip index.</param>
    /// <param name="writer">Placeholder writer.</param>
    /// <param name="extractionCache">Extraction cache (its folder is never scanned for zips).</param>
    /// <param name="logger">Logger.</param>
    public PlaceholderSync(
        ILibraryManager libraryManager,
        IApplicationPaths applicationPaths,
        IFileSystem fileSystem,
        PlaceholderIndex index,
        PlaceholderWriter writer,
        ZipExtractionCache extractionCache,
        ILogger<PlaceholderSync> logger)
    {
        _libraryManager = libraryManager;
        _applicationPaths = applicationPaths;
        _fileSystem = fileSystem;
        _index = index;
        _writer = writer;
        _extractionCache = extractionCache;
        _logger = logger;
    }

    /// <summary>
    /// Gets the placeholder folder, or null when placeholders go next to their zips.
    /// </summary>
    public string? PlaceholderRoot
    {
        get
        {
            var config = Plugin.Instance?.Configuration;
            if (config?.PlaceholdersNextToZips == true)
            {
                return null;
            }

            return string.IsNullOrWhiteSpace(config?.PlaceholderFolder)
                ? Path.Combine(_applicationPaths.DataPath, "karaoke-placeholders")
                : config.PlaceholderFolder;
        }
    }

    /// <summary>
    /// Gets the folders searched for zips: the configured ones, or every music library folder.
    /// The placeholder and extraction folders are never searched.
    /// </summary>
    /// <returns>The folders.</returns>
    public IReadOnlyList<string> ZipRoots()
    {
        var configured = Plugin.Instance?.Configuration.ZipFolders ?? [];
        var roots = configured.Length > 0
            ? configured
            : _libraryManager.GetVirtualFolders()
                .Where(folder => folder.CollectionType == CollectionTypeOptions.music)
                .SelectMany(folder => folder.Locations);
        var placeholderRoot = PlaceholderRoot;
        return roots
            .Where(root => !string.IsNullOrWhiteSpace(root))
            .Where(root => placeholderRoot is null || !ZipNaming.IsInside(root, placeholderRoot))
            .Where(root => !ZipNaming.IsInside(root, _extractionCache.Root))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Runs one pass. If a pass is already running this returns straight away.
    /// </summary>
    /// <param name="progress">Progress (0-100).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Number of placeholders created and removed, or null if a pass was already running.</returns>
    public async Task<(int Created, int Removed)?> RunAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            return null;
        }

        try
        {
            var roots = ZipRoots();
            var zips = roots.SelectMany(root => EnumerateZips(root).Select(zip => (Root: root, Zip: zip))).ToList();
            var changedFolders = new HashSet<string>(StringComparer.Ordinal);
            var created = 0;

            for (var i = 0; i < zips.Count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (await SyncZipAsync(zips[i].Root, zips[i].Zip, changedFolders, cancellationToken).ConfigureAwait(false))
                {
                    created++;
                }

                progress.Report(90.0 * (i + 1) / Math.Max(zips.Count, 1));
            }

            var removed = RemoveOrphans(zips.Select(zip => zip.Zip).ToHashSet(StringComparer.Ordinal), changedFolders);
            _index.Save();

            if (created + removed > 0)
            {
                _logger.LogInformation("Karaoke placeholders: {Created} created, {Removed} removed", created, removed);
                await RefreshLibraryAsync(changedFolders, cancellationToken).ConfigureAwait(false);
            }

            progress.Report(100);
            return (created, removed);
        }
        finally
        {
            _gate.Release();
        }
    }

    private static IEnumerable<string> EnumerateZips(string root)
    {
        if (!Directory.Exists(root))
        {
            return [];
        }

        var options = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = true,
            MatchCasing = MatchCasing.CaseInsensitive,
        };
        return Directory.EnumerateFiles(root, "*.zip", options);
    }

    private async Task<bool> SyncZipAsync(string root, string zipPath, HashSet<string> changedFolders, CancellationToken cancellationToken)
    {
        var file = new FileInfo(zipPath);
        var existing = _index.FindByZip(zipPath);
        var placeholder = ZipNaming.PlaceholderPath(zipPath, root, PlaceholderRoot);

        // Unchanged zip whose placeholder is in place (or that isn't a karaoke zip): nothing to do.
        // A placeholder elsewhere (the placeholder location setting changed) is moved.
        if (existing is not null
            && existing.Matches(file.Length, file.LastWriteTimeUtc.Ticks)
            && (existing.PlaceholderPath is null
                || (existing.PlaceholderPath == placeholder && File.Exists(placeholder))))
        {
            return false;
        }

        var record = new ZipRecord
        {
            ZipPath = zipPath,
            ZipRoot = root,
            ZipSize = file.Length,
            ZipModifiedTicks = file.LastWriteTimeUtc.Ticks,
        };

        KaraokeZipContents? contents = null;
        try
        {
            contents = KaraokeZip.Inspect(zipPath);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Could not read {Zip}", zipPath);
        }

        if (contents is null || IsForeignFile(placeholder, zipPath))
        {
            if (contents is not null)
            {
                _logger.LogWarning("Not replacing {Path}, which isn't a karaoke placeholder", placeholder);
            }

            DeletePlaceholder(existing, changedFolders);
            _index.Upsert(record); // Remembered so unchanged zips aren't inspected again
            return false;
        }

        record.AudioEntry = contents.AudioEntry;
        record.CdgEntry = contents.CdgEntry;
        record.PlaceholderPath = placeholder;
        if (existing?.PlaceholderPath is not null && existing.PlaceholderPath != placeholder)
        {
            DeletePlaceholder(existing, changedFolders);
        }

        if (!await _writer.WriteAsync(record, cancellationToken).ConfigureAwait(false))
        {
            return false; // Not recorded, so the next pass tries again
        }

        _index.Upsert(record);
        changedFolders.Add(Path.GetDirectoryName(placeholder)!);
        return true;
    }

    // A file already at the placeholder path that the plugin didn't write (e.g. a real MP3
    // next to the zip) is never overwritten
    private bool IsForeignFile(string placeholder, string zipPath) =>
        File.Exists(placeholder) && _index.FindByPlaceholder(placeholder)?.ZipPath != zipPath;

    private int RemoveOrphans(HashSet<string> seen, HashSet<string> changedFolders)
    {
        var removed = 0;
        foreach (var record in _index.All().Where(record => !seen.Contains(record.ZipPath)))
        {
            // If the whole zip folder is missing (e.g. a disconnected NAS), keep everything
            if (!Directory.Exists(record.ZipRoot) || File.Exists(record.ZipPath))
            {
                continue;
            }

            if (DeletePlaceholder(record, changedFolders))
            {
                removed++;
            }

            _index.Remove(record.ZipPath);
        }

        return removed;
    }

    private bool DeletePlaceholder(ZipRecord? record, HashSet<string> changedFolders)
    {
        if (record?.PlaceholderPath is null || !File.Exists(record.PlaceholderPath))
        {
            return false;
        }

        File.Delete(record.PlaceholderPath);
        changedFolders.Add(Path.GetDirectoryName(record.PlaceholderPath)!);
        return true;
    }

    private async Task RefreshLibraryAsync(HashSet<string> changedFolders, CancellationToken cancellationToken)
    {
        if (await EnsureKaraokeLibraryAsync().ConfigureAwait(false))
        {
            return; // Adding the library scans it
        }

        var options = new MetadataRefreshOptions(new DirectoryService(_fileSystem));
        var folders = changedFolders
            .Select(FindLibraryFolder)
            .OfType<Folder>()
            .DistinctBy(folder => folder.Id)
            .ToList();
        if (folders.Count == 0)
        {
            _logger.LogWarning("Karaoke placeholders are not in any Jellyfin library yet; add {Folder} as a music library", PlaceholderRoot);
        }

        foreach (var folder in folders)
        {
            await folder.ValidateChildren(new Progress<double>(), options, recursive: true, cancellationToken: cancellationToken).ConfigureAwait(false);
        }
    }

    // The nearest folder Jellyfin knows about, walking up from a changed folder
    private Folder? FindLibraryFolder(string path)
    {
        for (var current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            if (_libraryManager.FindByPath(current, true) is Folder folder)
            {
                return folder;
            }
        }

        return null;
    }

    private async Task<bool> EnsureKaraokeLibraryAsync()
    {
        var root = PlaceholderRoot;
        if (root is null || Plugin.Instance?.Configuration.CreateKaraokeLibrary == false)
        {
            return false;
        }

        var libraries = _libraryManager.GetVirtualFolders();
        if (libraries.Any(library => library.Locations.Any(location => ZipNaming.IsInside(root, location))))
        {
            return false;
        }

        try
        {
            Directory.CreateDirectory(root);
            var name = libraries.Any(library => library.Name == LibraryName) ? LibraryName + " (zips)" : LibraryName;
            var options = new LibraryOptions { PathInfos = [new MediaPathInfo(root)] };
            await _libraryManager.AddVirtualFolder(name, CollectionTypeOptions.music, options, refreshLibrary: true).ConfigureAwait(false);
            _logger.LogInformation("Created the {Name} music library for karaoke placeholders in {Folder}", name, root);
            return true;
        }
        catch (Exception ex) when (ex is IOException or ArgumentException or InvalidOperationException)
        {
            _logger.LogError(ex, "Could not create a library for {Folder}; add it as a music library by hand", root);
            return false;
        }
    }
}
