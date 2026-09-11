$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "windows-msi-arguments.ps1")

$cases = @(
    @{ InputArgs = @('/i', 'C:\Statusline Companion.msi', '/qn'); Expected = '/i "C:\Statusline Companion.msi" /qn' },
    @{ InputArgs = @('STATUSLINE_UPDATER=1', 'AUTOLAUNCHAPP=True'); Expected = 'STATUSLINE_UPDATER="1" AUTOLAUNCHAPP="True"' },
    @{ InputArgs = @('LAUNCHAPPARGS=--statusline-window-smoke "C:\Users\Álvaro López\ready.txt"'); Expected = 'LAUNCHAPPARGS="--statusline-window-smoke ""C:\Users\Álvaro López\ready.txt"""' },
    @{ InputArgs = @('LAUNCHAPPARGS='); Expected = 'LAUNCHAPPARGS=""' },
    @{ InputArgs = @('LABEL=embedded "quotes" and spaces'); Expected = 'LABEL="embedded ""quotes"" and spaces"' },
    @{ InputArgs = @('/l*v', 'C:\Temp\statusline.log'); Expected = '/l*v C:\Temp\statusline.log' }
)
foreach ($case in $cases) {
    $actual = ConvertTo-WindowsInstallerArguments -Arguments $case.InputArgs
    if ($actual -cne $case.Expected) { throw "MSI argument encoding failed: $actual" }
}
foreach ($invalid in @('C:\bad"path.msi', "LABEL=line`nbreak", '')) {
    $rejected = $false
    try { ConvertTo-WindowsInstallerArguments -Arguments @($invalid) | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw "MSI argument encoder accepted invalid input" }
}
Write-Host "Windows Installer argument encoding: 9 cases passed."
