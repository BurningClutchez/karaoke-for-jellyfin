using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Optional (WatchZipFolders): watches the zip folders and creates placeholders about 30
/// seconds after zips are added, renamed or deleted. Network shares often don't report
/// changes, so the hourly task remains the backstop.
/// </summary>
public sealed class ZipFolderWatcher : IHostedService, IDisposable
{
    private static readonly TimeSpan Delay = TimeSpan.FromSeconds(30);
    private readonly PlaceholderSync _sync;
    private readonly ILogger<ZipFolderWatcher> _logger;
    private readonly List<FileSystemWatcher> _watchers = [];
    private readonly Timer _timer;

    /// <summary>
    /// Initializes a new instance of the <see cref="ZipFolderWatcher"/> class.
    /// </summary>
    /// <param name="sync">Placeholder sync.</param>
    /// <param name="logger">Logger.</param>
    public ZipFolderWatcher(PlaceholderSync sync, ILogger<ZipFolderWatcher> logger)
    {
        _sync = sync;
        _logger = logger;
        _timer = new Timer(_ => RunSync(), null, Timeout.Infinite, Timeout.Infinite);
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (Plugin.Instance?.Configuration.WatchZipFolders != true)
        {
            return Task.CompletedTask;
        }

        foreach (var root in _sync.ZipRoots().Where(Directory.Exists))
        {
            var watcher = new FileSystemWatcher(root) { IncludeSubdirectories = true };
            watcher.Created += OnChanged;
            watcher.Deleted += OnChanged;
            watcher.Renamed += OnChanged;
            watcher.EnableRaisingEvents = true;
            _watchers.Add(watcher);
        }

        _logger.LogInformation("Watching {Count} folders for karaoke zips", _watchers.Count);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer.Change(Timeout.Infinite, Timeout.Infinite);
        foreach (var watcher in _watchers)
        {
            watcher.EnableRaisingEvents = false;
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _timer.Dispose();
        _watchers.ForEach(watcher => watcher.Dispose());
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        var renamedFrom = e is RenamedEventArgs renamed ? renamed.OldFullPath : string.Empty;
        if (e.FullPath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)
            || renamedFrom.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
        {
            // Restart the countdown, so copying many zips triggers one pass
            _timer.Change(Delay, Timeout.InfiniteTimeSpan);
        }
    }

    private void RunSync()
    {
        _sync.RunAsync(new Progress<double>(), CancellationToken.None).ContinueWith(
            task => _logger.LogError(task.Exception, "Karaoke placeholder pass failed"),
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);
    }
}
