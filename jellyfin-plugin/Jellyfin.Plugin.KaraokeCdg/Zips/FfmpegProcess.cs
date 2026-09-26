using System.Diagnostics;

namespace Jellyfin.Plugin.KaraokeCdg.Zips;

/// <summary>
/// Runs ffmpeg or ffprobe and captures its output.
/// </summary>
public static class FfmpegProcess
{
    /// <summary>
    /// Runs a program to completion.
    /// </summary>
    /// <param name="program">ffmpeg or ffprobe path.</param>
    /// <param name="arguments">Arguments (passed without shell quoting).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Exit code, standard output and standard error.</returns>
    public static async Task<(int ExitCode, string Output, string Errors)> RunAsync(
        string program,
        IEnumerable<string> arguments,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo(program)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException($"{program} did not start");
        var output = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errors = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        return (process.ExitCode, await output.ConfigureAwait(false), await errors.ConfigureAwait(false));
    }
}
