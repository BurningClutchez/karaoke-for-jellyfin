using Jellyfin.Plugin.KaraokeCdg.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// Serves CD+G karaoke graphics that sit next to audio files in the library.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Jellyfin application paths.</param>
    /// <param name="xmlSerializer">Serializer for the plugin configuration.</param>
    /// <param name="logger">Logger.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _logger = logger;
        LogSettingsWarnings(Configuration);
        ConfigurationChanged += (_, config) => LogSettingsWarnings((PluginConfiguration)config);
    }

    /// <summary>
    /// Gets the running plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    private readonly ILogger<Plugin> _logger;

    /// <inheritdoc />
    public override string Name => "Karaoke CDG";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("1cb1fb71-1f2b-46c8-8544-3491558b01ec");

    /// <inheritdoc />
    public override string Description =>
        "Serves .cdg karaoke graphics for audio files, raw or pre-rendered to video, for Karaoke for Jellyfin.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html",
        },
    ];

    private void LogSettingsWarnings(PluginConfiguration config)
    {
        foreach (var warning in SettingsCheck.Warnings(config))
        {
            _logger.LogWarning("Karaoke CDG settings: {Warning}", warning);
        }
    }
}
