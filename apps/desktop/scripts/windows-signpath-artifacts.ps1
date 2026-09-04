[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("RestoreApplication", "StageInstallers")]
    [string]$Mode,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-UniqueFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $matches = @(Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $Filter)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one $Description below $Root; found $($matches.Count)."
    }
    return $matches[0]
}

if (-not (Test-Path -LiteralPath $InputPath -PathType Container)) {
    throw "Input directory does not exist: $InputPath"
}

switch ($Mode) {
    "RestoreApplication" {
        $application = Get-UniqueFile `
            -Root $InputPath `
            -Filter "statusline-desktop.exe" `
            -Description "Statusline application executable"
        $outputParent = Split-Path -Parent $OutputPath
        New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
        Copy-Item -LiteralPath $application.FullName -Destination $OutputPath -Force
        Write-Host "Restored the SignPath-signed application executable."
    }
    "StageInstallers" {
        $nsis = Get-UniqueFile `
            -Root $InputPath `
            -Filter "*.exe" `
            -Description "NSIS installer"
        $msi = Get-UniqueFile `
            -Root $InputPath `
            -Filter "*.msi" `
            -Description "MSI installer"
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
        $existing = @(Get-ChildItem -LiteralPath $OutputPath -Force)
        if ($existing.Count -ne 0) {
            throw "Output directory must be empty: $OutputPath"
        }
        Copy-Item -LiteralPath $nsis.FullName -Destination $OutputPath
        Copy-Item -LiteralPath $msi.FullName -Destination $OutputPath
        Write-Host "Staged one NSIS installer and one MSI installer."
    }
}
