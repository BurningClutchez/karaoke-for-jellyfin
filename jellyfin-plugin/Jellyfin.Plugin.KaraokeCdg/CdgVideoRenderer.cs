using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using Jellyfin.Plugin.KaraokeCdg.Cache;
using MediaBrowser.Controller.MediaEncoding;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg;

/// <summary>
/// What to render: the CDG graphics alone (for the Karaoke for Jellyfin TV, which plays the
/// song's audio itself), or graphics and audio together (for Jellyfin's own clients).
/// </summary>
/// <param name="ItemId">Audio item the CDG belongs to.</param>
/// <param name="CdgPath">Path of the CDG file.</param>
/// <param name="Format">Container and codec to render.</param>
/// <param name="AudioPath">Audio file to mux in, or null for a silent video.</param>
/// <param name="SourcePath">File that identifies the source for caching, used instead of the
/// CDG and audio files when set (a zip, whose extracted copies come and go).</param>
public sealed record CdgRenderJob(
    Guid ItemId,
    string CdgPath,
    CdgVideoFormat Format,
    string? AudioPath = null,
    string? SourcePath = null);

/// <summary>
/// Pre-renders CDG graphics to a seekable video with Jellyfin's ffmpeg and caches the result.
/// </summary>
public sealed class CdgVideoRenderer
{
    private readonly ConcurrentDictionary<string, Lazy<Task<string?>>> _jobs = new();
    private readonly IMediaEncoder _mediaEncoder;
    private readonly VideoCache _cache;
    private readonly ILogger<CdgVideoRenderer> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="CdgVideoRenderer"/> class.
    /// </summary>
    /// <param name="mediaEncoder">Provides the path of Jellyfin's ffmpeg.</param>
    /// <param name="cache">The video cache folder.</param>
    /// <param name="logger">Logger.</param>
    public CdgVideoRenderer(IMediaEncoder mediaEncoder, VideoCache cache, ILogger<CdgVideoRenderer> logger)
    {
        _mediaEncoder = mediaEncoder;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Returns the cached video for a job, rendering it first if needed.
    /// Concurrent requests for the same video share one ffmpeg run.
    /// </summary>
    /// <param name="job">What to render.</param>
    /// <returns>Path of the video, or null if rendering failed.</returns>
    public Task<string?> GetOrRenderAsync(CdgRenderJob job)
    {
        var output = GetCachePath(job);
        if (File.Exists(output))
        {
            _cache.MarkUsed(output);
            return Task.FromResult<string?>(output);
        }

        var render = _jobs.GetOrAdd(output, key => new Lazy<Task<string?>>(() => RenderAsync(job, key)));
        return render.Value;
    }

    /// <summary>
    /// Gets where the video for a job is (or will be) cached. The name includes the size and
    /// timestamp of the source files, so editing either one produces a new render.
    /// </summary>
    /// <param name="job">What to render.</param>
    /// <returns>The cache file path.</returns>
    public string GetCachePath(CdgRenderJob job)
    {
        var extension = job.Format == CdgVideoFormat.WebM ? "webm" : "mp4";
        if (job.SourcePath is not null)
        {
            var source = new FileInfo(job.SourcePath);
            var zipName = string.Create(
                CultureInfo.InvariantCulture,
                $"{job.ItemId:N}-z{source.Length}-{source.LastWriteTimeUtc.Ticks}{(job.AudioPath is null ? string.Empty : "-av")}");
            return Path.Combine(_cache.Root, $"{zipName}.{extension}");
        }

        var cdg = new FileInfo(job.CdgPath);
        var name = string.Create(
            CultureInfo.InvariantCulture,
            $"{job.ItemId:N}-{cdg.Length}-{cdg.LastWriteTimeUtc.Ticks}");
        if (job.AudioPath is not null)
        {
            var audio = new FileInfo(job.AudioPath);
            name += string.Create(CultureInfo.InvariantCulture, $"-av-{audio.Length}-{audio.LastWriteTimeUtc.Ticks}");
        }

        return Path.Combine(_cache.Root, $"{name}.{extension}");
    }

    /// <summary>
    /// Builds the ffmpeg arguments: CDG (and optionally audio) in, duplicate frames dropped,
    /// 3x nearest-neighbour upscale, H.264 MP4 or VP9 WebM out.
    /// </summary>
    /// <param name="job">What to render.</param>
    /// <param name="output">Video file path.</param>
    /// <returns>The argument list.</returns>
    public static IReadOnlyList<string> BuildArguments(CdgRenderJob job, string output)
    {
        var muxAudio = job.AudioPath is not null;
        List<string> args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "cdg", "-i", job.CdgPath];

        if (muxAudio)
        {
            args.AddRange(["-i", job.AudioPath!, "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000"]);
        }
        else
        {
            args.Add("-an");
        }

        // Cap at 30 fps, then drop frames identical to the previous one: CDG graphics are
        // still most of the time, so this cuts encode time and size several-fold. Kept frames
        // keep their timestamps (variable frame rate). Videos for Jellyfin's clients keep at
        // least one frame a second, which suits more players.
        var dropLimit = muxAudio ? "30" : "0";
        args.AddRange(
        [
            "-vf", $"fps=30,mpdecimate=max={dropLimit}:hi=1:lo=1:frac=0,scale=900:648:flags=neighbor,format=yuv420p",
            "-fps_mode", "vfr"
        ]);

        if (job.Format == CdgVideoFormat.WebM)
        {
            args.AddRange(["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "30", "-b:v", "0", "-f", "webm", output]);
            return args;
        }

        args.AddRange(["-c:v", "libx264", "-preset", "veryfast", "-tune", "animation", "-crf", "18"]);
        if (muxAudio)
        {
            // Predictable profile for client device profiles, and a keyframe every 2 s so
            // Jellyfin's clients can seek
            args.AddRange(["-profile:v", "high", "-level:v", "4.0", "-force_key_frames", "expr:gte(t,n_forced*2)"]);
        }

        args.AddRange(["-movflags", "+faststart", "-f", "mp4", output]);
        return args;
    }

    /// <summary>
    /// Checks whether a video is being rendered right now.
    /// </summary>
    /// <param name="videoPath">Cache path of the video.</param>
    /// <returns>True while ffmpeg writes it.</returns>
    public bool IsRendering(string videoPath) => _jobs.ContainsKey(videoPath);

    /// <summary>
    /// Records that a cached video was played, which restarts its retention period.
    /// </summary>
    /// <param name="videoPath">Cache path of the video.</param>
    public void MarkUsed(string videoPath) => _cache.MarkUsed(videoPath);

    /// <summary>
    /// Length of a song, worked out from its CDG file: CD+G is 300 packets of 24 bytes a second.
    /// </summary>
    /// <param name="cdgBytes">Size of the CDG file.</param>
    /// <returns>The length in seconds.</returns>
    public static double CdgSeconds(long cdgBytes) => cdgBytes / 7200.0;

    /// <summary>
    /// MIME type served for a rendered format.
    /// </summary>
    /// <param name="format">Rendered format.</param>
    /// <returns>The MIME type.</returns>
    public static string ContentType(CdgVideoFormat format) =>
        format == CdgVideoFormat.WebM ? "video/webm" : "video/mp4";

    private async Task<string?> RenderAsync(CdgRenderJob job, string output)
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
            foreach (var argument in BuildArguments(job, temp))
            {
                startInfo.ArgumentList.Add(argument);
            }

            var clock = Stopwatch.StartNew();
            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("ffmpeg did not start");
            var errors = await process.StandardError.ReadToEndAsync().ConfigureAwait(false);
            await process.WaitForExitAsync().ConfigureAwait(false);

            if (process.ExitCode != 0)
            {
                _logger.LogError("Rendering {CdgPath} failed ({ExitCode}): {Errors}", job.CdgPath, process.ExitCode, errors);
                File.Delete(temp);
                return null;
            }

            File.Move(temp, output, overwrite: true);
            _logger.LogInformation("Rendered CDG video {Output} in {Seconds:0.0} s", output, clock.Elapsed.TotalSeconds);
            if (job.AudioPath is not null)
            {
                // Karaoke channel videos: the kind the render estimate is about
                _cache.AddRender(CdgSeconds(new FileInfo(job.CdgPath).Length), clock.Elapsed.TotalSeconds, new FileInfo(output).Length);
            }

            _cache.MarkUsed(output);
            return output;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            _logger.LogError(ex, "Rendering {CdgPath} failed", job.CdgPath);
            return null;
        }
        finally
        {
            _jobs.TryRemove(output, out _);
        }
    }
}
