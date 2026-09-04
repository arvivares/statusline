[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Value {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Required Windows signing value is missing: $Name"
    }
}

Require-Value -Name "WINDOWS_CERTIFICATE" -Value $env:WINDOWS_CERTIFICATE
Require-Value -Name "WINDOWS_CERTIFICATE_PASSWORD" -Value $env:WINDOWS_CERTIFICATE_PASSWORD
Require-Value -Name "WINDOWS_TIMESTAMP_URL" -Value $env:WINDOWS_TIMESTAMP_URL
Require-Value -Name "GITHUB_OUTPUT" -Value $env:GITHUB_OUTPUT
Require-Value -Name "RUNNER_TEMP" -Value $env:RUNNER_TEMP

$timestampUri = $null
if (-not [Uri]::TryCreate($env:WINDOWS_TIMESTAMP_URL, [UriKind]::Absolute, [ref]$timestampUri)) {
    throw "WINDOWS_TIMESTAMP_URL must be an absolute URL"
}
if ($timestampUri.Scheme -notin @("http", "https")) {
    throw "WINDOWS_TIMESTAMP_URL must use HTTP or HTTPS"
}

$pfxPath = Join-Path $env:RUNNER_TEMP "statusline-code-signing.pfx"
$configPath = Join-Path $env:RUNNER_TEMP "statusline-signing.json"
$normalizedCertificate = $env:WINDOWS_CERTIFICATE -replace "\s", ""
$importedThumbprint = ""

try {
    try {
        $certificateBytes = [Convert]::FromBase64String($normalizedCertificate)
    }
    catch {
        throw "WINDOWS_CERTIFICATE is not valid base64"
    }

    [IO.File]::WriteAllBytes($pfxPath, $certificateBytes)
    $securePassword = ConvertTo-SecureString `
        -String $env:WINDOWS_CERTIFICATE_PASSWORD `
        -AsPlainText `
        -Force
    $certificate = Import-PfxCertificate `
        -FilePath $pfxPath `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -Password $securePassword `
        -Exportable | Where-Object HasPrivateKey | Select-Object -First 1

    if ($null -eq $certificate) {
        throw "The imported PFX did not contain a certificate with a private key"
    }
    $importedThumbprint = $certificate.Thumbprint

    $configuration = [ordered]@{
        bundle = [ordered]@{
            windows = [ordered]@{
                certificateThumbprint = $importedThumbprint
                digestAlgorithm = "sha256"
                timestampUrl = $timestampUri.AbsoluteUri
            }
        }
    }
    $json = $configuration | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText(
        $configPath,
        $json,
        [Text.UTF8Encoding]::new($false)
    )

    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "args=--config=$configPath"
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "thumbprint=$importedThumbprint"
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "pfx-path=$pfxPath"
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "config-path=$configPath"
}
catch {
    if (-not [string]::IsNullOrWhiteSpace($importedThumbprint)) {
        $certificatePath = "Cert:\CurrentUser\My\$importedThumbprint"
        if (Test-Path -LiteralPath $certificatePath) {
            Remove-Item -LiteralPath $certificatePath -Force
        }
    }
    foreach ($temporaryPath in @($pfxPath, $configPath)) {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
    throw
}

Write-Host "Windows signing certificate imported and temporary Tauri config prepared."
