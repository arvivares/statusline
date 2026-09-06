param(
    [Parameter(Mandatory = $true)][string]$ApplicationPath,
    [Parameter(Mandatory = $true)][string]$BundleRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$application = Get-Item -LiteralPath $ApplicationPath
if ($application.PSIsContainer -or $application.Extension -ne '.exe') {
    throw 'Expected the built Windows application executable.'
}
$files = @($application)
foreach ($extension in @('.exe', '.msi')) {
    $installers = @(Get-ChildItem -LiteralPath $BundleRoot -Recurse -File |
        Where-Object { $_.Extension -eq $extension })
    if ($installers.Count -ne 1) {
        throw "Expected exactly one $extension installer, found $($installers.Count)."
    }
    $files += $installers[0]
}
foreach ($file in $files) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'NotSigned') {
        throw "Unsigned preview requires NotSigned status: $($file.Name): $($signature.Status)."
    }
    Write-Host "Unsigned preview verified: $($file.Name) (no Authenticode signature)."
}
