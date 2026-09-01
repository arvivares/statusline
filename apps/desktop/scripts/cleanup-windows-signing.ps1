[CmdletBinding()]
param(
    [AllowEmptyString()][string]$Thumbprint,
    [AllowEmptyString()][string]$PfxPath,
    [AllowEmptyString()][string]$ConfigPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$runnerTemp = [Environment]::GetEnvironmentVariable("RUNNER_TEMP")
if ([string]::IsNullOrWhiteSpace($PfxPath) -and -not [string]::IsNullOrWhiteSpace($runnerTemp)) {
    $PfxPath = Join-Path $runnerTemp "statusline-code-signing.pfx"
}
if ([string]::IsNullOrWhiteSpace($ConfigPath) -and -not [string]::IsNullOrWhiteSpace($runnerTemp)) {
    $ConfigPath = Join-Path $runnerTemp "statusline-signing.json"
}

if (-not [string]::IsNullOrWhiteSpace($Thumbprint)) {
    $certificatePath = "Cert:\CurrentUser\My\$Thumbprint"
    if (Test-Path -LiteralPath $certificatePath) {
        Remove-Item -LiteralPath $certificatePath -Force
    }
}

foreach ($temporaryPath in @($PfxPath, $ConfigPath)) {
    if (
        -not [string]::IsNullOrWhiteSpace($temporaryPath) -and
        (Test-Path -LiteralPath $temporaryPath)
    ) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}

Write-Host "Temporary Windows signing material removed from the runner."
