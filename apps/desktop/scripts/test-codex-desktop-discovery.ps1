# Exercise the embedded production query without accessing real packages/accounts.
$ErrorActionPreference = 'Stop'
$queryScript = Join-Path $PSScriptRoot 'discover-codex-desktop-windows.ps1'

function Invoke-DiscoveryFixture {
    param([object[]]$Fixture)
    function Get-AppxPackage {
        param([string]$Name, [string]$PackageTypeFilter)
        if ($Name -ne 'OpenAI.*' -or $PackageTypeFilter -ne 'Main') {
            throw 'Unexpected package query scope'
        }
        $Fixture
    }
    $json = (& $queryScript) -join "`n"
    if (-not $json.StartsWith('[') -or -not $json.EndsWith(']')) {
        throw 'Discovery must always emit a JSON array, including zero/one package'
    }
    # Windows PowerShell 5.1 emits the parsed array as one pipeline object.
    # Enumerate explicitly so @() counts packages, not an empty/nested array.
    # https://github.com/PowerShell/PowerShell/issues/3424
    foreach ($package in (ConvertFrom-Json -InputObject $json)) {
        if ($null -ne $package) {
            Write-Output $package
        }
    }
}

if (@(Invoke-DiscoveryFixture -Fixture @()).Count -ne 0) {
    throw 'Empty package result should stay empty'
}
$codex = [pscustomobject]@{
    Name = 'OpenAI.Codex'
    InstallLocation = 'D:\WindowsApps\OpenAI.Codex_26.9_x64__fixture'
    Version = '26.9.0.0'
}
$single = @(Invoke-DiscoveryFixture -Fixture @($codex))
if ($single.Count -ne 1 -or $single[0].InstallLocation -ne $codex.InstallLocation) {
    throw 'Single package location was not preserved'
}
$newer = [pscustomobject]@{
    Name = 'OpenAI.ChatGPT-Desktop'
    InstallLocation = 'C:\Users\Fixture With Spaces\Apps\ChatGPT'
    Version = '26.10.0.0'
}
$unrelated = [pscustomobject]@{
    Name = 'Other.Codex'; InstallLocation = 'C:\Unrelated'; Version = '99.0.0.0'
}
$empty = [pscustomobject]@{
    Name = 'OpenAI.Codex'; InstallLocation = ''; Version = '99.0.0.0'
}
$result = @(Invoke-DiscoveryFixture -Fixture @($codex, $newer, $unrelated, $empty))
if ($result.Count -ne 2 -or $result[0].InstallLocation -ne $newer.InstallLocation) {
    throw 'Package filtering or numeric version ordering failed'
}
$bounded = @(Invoke-DiscoveryFixture -Fixture (@($codex) * 30))
if ($bounded.Count -ne 16) {
    throw 'Package result is not bounded'
}
Write-Output 'Windows desktop discovery query: empty, single, filtering, ordering and bounds passed.'
