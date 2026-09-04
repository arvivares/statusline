[CmdletBinding()]
param(
    [string]$ApplicationPath = "",
    [Parameter(Mandatory = $true)][string]$InstallerRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedSignerSubject
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $InstallerRoot -PathType Container)) {
    throw "Installer directory does not exist: $InstallerRoot"
}
if ([string]::IsNullOrWhiteSpace($ExpectedSignerSubject)) {
    throw "ExpectedSignerSubject cannot be empty."
}

$installerFiles = @(
    Get-ChildItem -LiteralPath $InstallerRoot -Recurse -File |
        Where-Object { $_.Extension -in @(".exe", ".msi") }
)
if ($installerFiles.Count -ne 2) {
    throw "Expected one NSIS installer and one MSI installer; found $($installerFiles.Count)."
}
if (@($installerFiles | Where-Object Extension -eq ".exe").Count -ne 1) {
    throw "Expected exactly one signed NSIS executable."
}
if (@($installerFiles | Where-Object Extension -eq ".msi").Count -ne 1) {
    throw "Expected exactly one signed MSI package."
}

$files = $installerFiles
if (-not [string]::IsNullOrWhiteSpace($ApplicationPath)) {
    if (-not (Test-Path -LiteralPath $ApplicationPath -PathType Leaf)) {
        throw "Application executable does not exist: $ApplicationPath"
    }
    $files = @((Get-Item -LiteralPath $ApplicationPath)) + $installerFiles
}
foreach ($file in $files) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne "Valid") {
        throw "Invalid Authenticode signature on $($file.Name): $($signature.Status)"
    }
    if ($null -eq $signature.SignerCertificate) {
        throw "Missing signer certificate on $($file.Name)."
    }
    if ($signature.SignerCertificate.Subject -notlike "*$ExpectedSignerSubject*") {
        throw "Unexpected signer on $($file.Name): $($signature.SignerCertificate.Subject)"
    }
    if ($null -eq $signature.TimeStamperCertificate) {
        throw "Missing trusted timestamp on $($file.Name)."
    }
}

if ([string]::IsNullOrWhiteSpace($ApplicationPath)) {
    Write-Host "Verified Authenticode signer and timestamp on NSIS and MSI."
}
else {
    Write-Host "Verified Authenticode signer and timestamp on the application, NSIS and MSI."
}
