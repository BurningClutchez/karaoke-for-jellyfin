using System.Globalization;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.MediaInfo;

namespace Jellyfin.Plugin.KaraokeCdg.Library;

/// <summary>
/// Describes the karaoke MP4 (graphics plus audio) that the renderer produces, so Jellyfin
/// can pick direct play or transcoding before the file has been rendered.
/// </summary>
public static class KaraokeMediaSource
{
    /// <summary>
    /// Builds the media source for a song's rendered karaoke video.
    /// </summary>
    /// <param name="song">The song.</param>
    /// <param name="videoPath">Where the rendered MP4 is (or will be) cached.</param>
    /// <returns>The media source.</returns>
    public static MediaSourceInfo Create(KaraokeSong song, string videoPath)
    {
        return new MediaSourceInfo
        {
            Id = song.Id.ToString("N", CultureInfo.InvariantCulture),
            Name = "Karaoke",
            Path = videoPath,
            Protocol = MediaProtocol.File,
            Type = MediaSourceType.Default,
            VideoType = VideoType.VideoFile,
            Container = "mp4",
            RunTimeTicks = song.RunTimeTicks,
            IsRemote = false,
            SupportsDirectPlay = true,
            SupportsDirectStream = true,
            SupportsTranscoding = true,
            SupportsProbing = false,
            Bitrate = 700_000,
            DefaultAudioStreamIndex = 1,
            MediaStreams =
            [
                new MediaStream
                {
                    Type = MediaStreamType.Video,
                    Index = 0,
                    Codec = "h264",
                    Profile = "High",
                    Level = 40,
                    Width = 900,
                    Height = 648,
                    AspectRatio = "25:18",
                    PixelFormat = "yuv420p",
                    BitDepth = 8,
                    IsInterlaced = false,
                    AverageFrameRate = 30,
                    RealFrameRate = 30,
                    BitRate = 500_000,
                    IsDefault = true,
                },
                new MediaStream
                {
                    Type = MediaStreamType.Audio,
                    Index = 1,
                    Codec = "aac",
                    Profile = "LC",
                    Channels = 2,
                    ChannelLayout = "stereo",
                    SampleRate = 48000,
                    BitRate = 192_000,
                    IsDefault = true,
                },
            ],
        };
    }
}
