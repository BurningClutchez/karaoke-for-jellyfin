namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// Video formats the CDG renderer can produce.
/// </summary>
public enum CdgVideoFormat
{
    /// <summary>
    /// H.264 in MP4. Plays on most TVs and in Chrome, Edge and Safari.
    /// </summary>
    Mp4 = 0,

    /// <summary>
    /// VP9 in WebM, for browsers without H.264 (e.g. open-source Chromium builds).
    /// </summary>
    WebM = 1,
}
