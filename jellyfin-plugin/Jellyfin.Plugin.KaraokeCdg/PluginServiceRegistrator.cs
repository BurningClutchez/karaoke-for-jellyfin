using Jellyfin.Plugin.KaraokeCdg.Library;
using Jellyfin.Plugin.KaraokeCdg.Zips;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Channels;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// Registers the plugin's services with Jellyfin's container.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Singleton so concurrent requests for the same song share one ffmpeg run
        serviceCollection.AddSingleton<CdgVideoRenderer>();
        serviceCollection.AddSingleton<KaraokeLibraryIndex>();
        serviceCollection.AddSingleton<KaraokeSongRenderer>();
        serviceCollection.AddSingleton<PlaceholderIndex>();
        serviceCollection.AddSingleton<PlaceholderWriter>();
        serviceCollection.AddSingleton<ZipExtractionCache>();
        serviceCollection.AddSingleton<KaraokeSourceResolver>();
        serviceCollection.AddSingleton<PlaceholderSync>();
        serviceCollection.AddHostedService<ZipFolderWatcher>();
        serviceCollection.AddSingleton<IChannel, KaraokeChannel>();
    }
}
