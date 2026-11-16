# Runs one mod's offline check through the DSH Electron runtime as Node.
#
# The mod checks are ESM scripts that load a browser-half module with stubbed
# React/Cordis, so they need neither a browser nor a checkout: only the Electron
# executable that DSH already runs, with ELECTRON_RUN_AS_NODE=1 (the only Node
# that can read app.asar and is guaranteed to exist for this installation).
#
# Usage:
#   pwsh -File tools/run-check.ps1 -Path session-cost/test/check.mjs
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Workdir
)

$ErrorActionPreference = 'Stop'

if (-not $env:DSH_NODE_EXECUTABLE) {
    throw 'DSH_NODE_EXECUTABLE is not set; run this from a DSH shell.'
}
$resolved = (Resolve-Path -LiteralPath $Path).Path
if (-not $Workdir) { $Workdir = Split-Path -Parent $resolved }
$Workdir = (Resolve-Path -LiteralPath $Workdir).Path

$runner = @'
const { pathToFileURL } = require('node:url');
const target = process.argv[1];
import(pathToFileURL(target).href).then(
  () => { process.exitCode = 0; },
  (error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  },
);
'@

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$start = [System.Diagnostics.ProcessStartInfo]::new($env:DSH_NODE_EXECUTABLE)
foreach ($argument in @('-e', $runner, '--', $resolved)) { $start.ArgumentList.Add($argument) }
$start.Environment['ELECTRON_RUN_AS_NODE'] = '1'
$start.WorkingDirectory = $Workdir
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$start.StandardErrorEncoding = [System.Text.Encoding]::UTF8

$process = [System.Diagnostics.Process]::Start($start)
$stderr = $process.StandardError.ReadToEndAsync()
$stdout = $process.StandardOutput.ReadToEnd()
$process.WaitForExit()
[Console]::Out.Write($stdout)
[Console]::Error.Write($stderr.Result)
exit $process.ExitCode
