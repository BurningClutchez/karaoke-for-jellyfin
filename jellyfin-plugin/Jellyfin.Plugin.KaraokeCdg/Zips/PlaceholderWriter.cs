using System.Text.Json;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.MediaEncoding;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Writes placeholder MP3s: silent, the same length as the zipped song, and carrying its tags,
/// so Jellyfin lists and searches zipped songs like any other.
/// </summary>
public sealed class PlaceholderWriter
{
    private readonly IMediaEncoder _mediaEncoder;
    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<PlaceholderWriter> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="PlaceholderWriter"/> class.
    /// </summary>
    /// <param name="mediaEncoder">Provides ffmpeg and ffprobe.</param>
    /// <param name="applicationPaths">Jellyfin paths.</param>
    /// <param name="logger">Logger.</param>
    public PlaceholderWriter(IMediaEncoder mediaEncoder, IApplicationPaths applicationPaths, ILogger<PlaceholderWriter> logger)
    {
        _mediaEncoder = mediaEncoder;
        _applicationPaths = applicationPaths;
        _logger = logger;
    }

    /// <summary>
    /// Writes the placeholder for a karaoke zip.
    /// </summary>
    /// <param name="zip">The zip (must be a karaoke zip).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>True if written.</returns>
    public async Task<bool> WriteAsync(ZipRecord zip, CancellationToken cancellationToken)
    {
        var work = Path.Combine(_applicationPaths.CachePath, "karaoke-work", Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(work);
            var audio = Path.Combine(work, "audio" + KaraokeZip.AudioExtension(zip.AudioEntry!));
            await Task.Run(() => KaraokeZip.ExtractEntry(zip.ZipPath, zip.AudioEntry!, audio), cancellationToken).ConfigureAwait(false);

            var tags = await ReadTagsAsync(audio, cancellationToken).ConfigureAwait(false);
            var output = zip.PlaceholderPath!;
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            var (exitCode, _, errors) = await FfmpegProcess.RunAsync(
                _mediaEncoder.EncoderPath,
                BuildArguments(audio, output + ".partial", tags, ZipNaming.ParseName(zip.ZipPath)),
                cancellationToken).ConfigureAwait(false);
            if (exitCode != 0)
            {
                _logger.LogError("Placeholder for {Zip} failed: {Errors}", zip.ZipPath, errors);
                File.Delete(output + ".partial");
                return false;
            }

            File.Move(output + ".partial", output, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException or InvalidOperationException)
        {
            _logger.LogError(ex, "Placeholder for {Zip} failed", zip.ZipPath);
            return false;
        }
        finally
        {
            try
            {
                Directory.Delete(work, recursive: true);
            }
            catch (IOException)
            {
                // Cache folder; harmless if left behind
            }
        }
    }

    /// <summary>
    /// Builds the ffmpeg arguments for a placeholder: the song's audio at zero volume,
    /// 8 kbps mono (about 60 KB a minute), with its tags. Title and artist fall back to the
    /// zip's file name when the audio has none.
    /// </summary>
    /// <param name="audio">Extracted audio file.</param>
    /// <param name="output">Output MP3 path.</param>
    /// <param name="tags">Tags found in the audio (keys lower case).</param>
    /// <param name="fromName">Artist and title parsed from the zip name.</param>
    /// <returns>The arguments.</returns>
    public static IReadOnlyList<string> BuildArguments(
        string audio,
        string output,
        IReadOnlyDictionary<string, string> tags,
        (string? Artist, string Title) fromName)
    {
        List<string> args =
        [
            "-hide_banner", "-loglevel", "error", "-y", "-i", audio,
            "-map", "0:a:0", "-af", "volume=0",
            "-c:a", "libmp3lame", "-b:a", "8k", "-ar", "8000", "-ac", "1",
            "-map_metadata", "0", "-id3v2_version", "3",
        ];
        if (!tags.ContainsKey("title"))
        {
            args.AddRange(["-metadata", "title=" + fromName.Title]);
        }

        if (!tags.ContainsKey("artist") && fromName.Artist is not null)
        {
            args.AddRange(["-metadata", "artist=" + fromName.Artist]);
        }

        args.AddRange(["-metadata", "comment=Karaoke placeholder: plays from its zip", "-f", "mp3", output]);
        return args;
    }

    /// <summary>
    /// Parses ffprobe's JSON output into non-empty tags with lower-case keys.
    /// </summary>
    /// <param name="json">ffprobe -show_entries format_tags -of json output.</param>
    /// <returns>The tags.</returns>
    public static Dictionary<string, string> ParseTags(string json)
    {
        var tags = new Dictionary<string, string>(StringComparer.Ordinal);
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.TryGetProperty("format", out var format)
            && format.TryGetProperty("tags", out var values))
        {
            foreach (var tag in values.EnumerateObject())
            {
                var value = tag.Value.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    tags[tag.Name.ToLowerInvariant()] = value;
                }
            }
        }

        return tags;
    }

    private async Task<Dictionary<string, string>> ReadTagsAsync(string audio, CancellationToken cancellationToken)
    {
        var (exitCode, output, _) = await FfmpegProcess.RunAsync(
            _mediaEncoder.ProbePath,
            ["-v", "error", "-show_entries", "format_tags", "-of", "json", audio],
            cancellationToken).ConfigureAwait(false);
        try
        {
            return exitCode == 0 ? ParseTags(output) : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
