# Enables the repository's versioned git hooks in the current clone.
#
# Hooks live in tools/git-hooks/ and travel with the repository; this script only
# points git at them, because `core.hooksPath` itself is local configuration.
#
# Usage:
#   pwsh -File tools/enable-hooks.ps1          # enable
#   pwsh -File tools/enable-hooks.ps1 -Status  # show the current setting
param(
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    if ($Status) {
        $current = git config --get core.hooksPath
        if ($LASTEXITCODE -ne 0 -or -not $current) {
            Write-Output 'core.hooksPath: не задан (хуки репозитория не активны)'
        } else {
            Write-Output "core.hooksPath: $current"
        }
        return
    }

    git config core.hooksPath tools/git-hooks
    if ($LASTEXITCODE -ne 0) { throw 'git config core.hooksPath failed' }
    Write-Output 'core.hooksPath = tools/git-hooks'
    Write-Output 'Хуки включены: pre-push проверяет, что память обновлена вместе с кодом.'
    Write-Output 'Проверить вручную: pwsh -File tools/check-memory.ps1'
} finally {
    Pop-Location
}
