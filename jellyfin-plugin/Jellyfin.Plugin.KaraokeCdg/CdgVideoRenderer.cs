using System.Collections.Concurrent;
using System.Diagnostics;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.MediaEncoding;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// Pre-renders CDG graphics to a silent, seekable video with Jellyfin's ffmpeg and caches the result.
/// The Karaoke for Jellyfin TV keeps the video in step with the song's audio, so no audio is muxed in.
/// </summary>
public sealed class CdgVideoRenderer
{
    private readonly ConcurrentDictionary<string, Lazy<Task<string?>>> _jobs = new();
    private readonly IMediaEncoder _mediaEncoder;
    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<CdgVideoRenderer> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="CdgVideoRenderer"/> class.
    /// </summary>
    /// <param name="mediaEncoder">Provides the path of Jellyfin's ffmpeg.</param>
    /// <param name="applicationPaths">Provides the cache folder.</param>
    /// <param name="logger">Logger.</param>
    public CdgVideoRenderer(IMediaEncoder mediaEncoder, IApplicationPaths applicationPaths, ILogger<CdgVideoRenderer> logger)
    {
        _mediaEncoder = mediaEncoder;
        _applicationPaths = applicationPaths;
        _logger = logger;
    }

    /// <summary>
    /// Returns the cached MP4 for a CDG file, rendering it first if needed.
    /// </summary>
    /// <param name="itemId">Jellyfin item the CDG belongs to.</param>
    /// <param name="cdgPath">Path of the CDG file.</param>
    /// <param name="format">Container and codec to render.</param>
    /// <returns>Path of the video, or null if rendering failed.</returns>
    public Task<string?> GetOrRenderAsync(Guid itemId, string cdgPath, CdgVideoFormat format)
    {
        var output = GetCachePath(itemId, cdgPath, format);
        if (File.Exists(output))
        {
            return Task.FromResult<string?>(output);
        }

        var job = _jobs.GetOrAdd(output, key => new Lazy<Task<string?>>(() => RenderAsync(cdgPath, key, format)));
        return job.Value;
    }

    /// <summary>
    /// Builds the ffmpeg arguments: CDG in, duplicate frames dropped, 3x nearest-neighbour
    /// upscale, H.264 MP4 or VP9 WebM out.
    /// </summary>
    /// <param name="input">CDG file path.</param>
    /// <param name="output">Video file path.</param>
    /// <param name="format">Container and codec to render.</param>
    /// <returns>The argument list.</returns>
    public static IReadOnlyList<string> BuildArguments(string input, string output, CdgVideoFormat format)
    {
        string[] common =
        [
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "cdg", "-i", input,
            "-an",
            // Cap at 30 fps, then drop frames identical to the previous one: CDG
            // graphics are still most of the time, so this cuts encode time and
            // size several-fold. Kept frames keep their timestamps (variable frame rate).
            "-vf", "fps=30,mpdecimate=max=0:hi=1:lo=1:frac=0,scale=900:648:flags=neighbor,format=yuv420p",
            "-fps_mode", "vfr"
        ];
        string[] codec = format == CdgVideoFormat.WebM
            ?
            [
                "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1",
                "-crf", "30", "-b:v", "0",
                "-f", "webm", output
            ]
            :
            [
                "-c:v", "libx264", "-preset", "veryfast", "-tune", "animation", "-crf", "18",
                "-movflags", "+faststart",
                "-f", "mp4", output
            ];
        return [.. common, .. codec];
    }

    /// <summary>
    /// MIME type served for a rendered format.
    /// </summary>
    /// <param name="format">Rendered format.</param>
    /// <returns>The MIME type.</returns>
    public static string ContentType(CdgVideoFormat format) =>
        format == CdgVideoFormat.WebM ? "video/webm" : "video/mp4";

    private string GetCachePath(Guid itemId, string cdgPath, CdgVideoFormat format)
    {
        // Include size and timestamp so an edited CDG file gets re-rendered
        var info = new FileInfo(cdgPath);
        var extension = format == CdgVideoFormat.WebM ? "webm" : "mp4";
        var name = $"{itemId:N}-{info.Length}-{info.LastWriteTimeUtc.Ticks}.{extension}";
        return Path.Combine(_applicationPaths.CachePath, "karaoke-cdg", name);
    }

    private async Task<string?> RenderAsync(string cdgPath, string output, CdgVideoFormat format)
    {
        var temp = output + ".partial";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            var startInfo = new ProcessStartInfo(_mediaEncoder.EncoderPath)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
            };
            foreach (var argument in BuildArguments(cdgPath, temp, format))
            {
                startInfo.ArgumentList.Add(argument);
            }

            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("ffmpeg did not start");
            var errors = await process.StandardError.ReadToEndAsync().ConfigureAwait(false);
            await process.WaitForExitAsync().ConfigureAwait(false);

            if (process.ExitCode != 0)
            {
                _logger.LogError("Rendering {CdgPath} failed ({ExitCode}): {Errors}", cdgPath, process.ExitCode, errors);
                File.Delete(temp);
                return null;
            }

            File.Move(temp, output, overwrite: true);
            _logger.LogInformation("Rendered CDG video {Output}", output);
            return output;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            _logger.LogError(ex, "Rendering {CdgPath} failed", cdgPath);
            return null;
        }
        finally
        {
            _jobs.TryRemove(output, out _);
        }
    }
}
