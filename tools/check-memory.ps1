# Runs the "memory follows code" check from Windows PowerShell.
#
# tools/check-memory.sh is POSIX sh and is what the git hook and GitHub Actions
# call. On Windows, a bare `bash` in PowerShell resolves to the WSL launcher, not
# to Git Bash, so this wrapper picks the bash that ships with Git.
#
# Usage:
#   pwsh -File tools/check-memory.ps1                      # origin/main..HEAD
#   pwsh -File tools/check-memory.ps1 -Base <ref> -Head <ref>
param(
    [string]$Base = 'origin/main',
    [string]$Head = 'HEAD'
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $candidates = @()
    $git = (Get-Command git -ErrorAction SilentlyContinue)
    if ($git) {
        $gitRoot = Split-Path (Split-Path $git.Source -Parent) -Parent
        $candidates += (Join-Path $gitRoot 'bin\bash.exe')
        $candidates += (Join-Path $gitRoot 'usr\bin\bash.exe')
    }
    $candidates += 'C:\Program Files\Git\bin\bash.exe'
    $candidates += 'C:\Program Files\Git\usr\bin\bash.exe'

    $bash = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $bash) {
        throw 'Git Bash not found; run tools/check-memory.sh from Git Bash, WSL or CI instead.'
    }

    & $bash -c "sh tools/check-memory.sh '$Base' '$Head'"
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
