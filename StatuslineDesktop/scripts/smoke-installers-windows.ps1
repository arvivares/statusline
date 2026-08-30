[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BundleRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-SingleBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string]$Filter
    )

    $files = @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -Recurse)
    if ($files.Count -ne 1) {
        throw "Expected one $Filter file in $Directory, found $($files.Count)"
    }
    return $files[0].FullName
}

function Invoke-CheckedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [int[]]$AllowedExitCodes = @(0),
        [ValidateRange(1, 600)][int]$TimeoutSeconds = 120
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.UseShellExecute = $false
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    Write-Host "Starting process: $(Split-Path -Leaf $FilePath)"
    try {
        if (-not $process.Start()) {
            throw "Could not start $FilePath"
        }
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try {
                $process.Kill($true)
                $process.WaitForExit()
            }
            catch {
                Write-Warning "Could not terminate timed-out process $($process.Id)"
            }
            throw "$FilePath timed out after $TimeoutSeconds seconds"
        }
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    if ($exitCode -notin $AllowedExitCodes) {
        throw "$FilePath exited with code $exitCode"
    }
    Write-Host "Process completed: $(Split-Path -Leaf $FilePath) ($exitCode)"
}

function Invoke-MsiPackage {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("install", "uninstall")][string]$Action,
        [Parameter(Mandatory = $true)][string]$PackagePath,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [int[]]$AllowedExitCodes = @(0, 3010)
    )

    $mode = if ($Action -eq "install") { "/i" } else { "/x" }
    try {
        Invoke-CheckedProcess `
            -FilePath "msiexec.exe" `
            -Arguments @($mode, $PackagePath, "/qn", "/norestart", "/l*v", $LogPath) `
            -AllowedExitCodes $AllowedExitCodes `
            -TimeoutSeconds 180
    }
    catch {
        if (Test-Path -LiteralPath $LogPath -PathType Leaf) {
            Write-Host "Last 120 lines from $LogPath"
            Get-Content -LiteralPath $LogPath -Tail 120
        }
        throw
    }
}

function Get-StatuslineUninstallEntry {
    $registryRoots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )
    foreach ($registryRoot in $registryRoots) {
        $entry = Get-ChildItem -LiteralPath $registryRoot -ErrorAction SilentlyContinue |
            Get-ItemProperty |
            Where-Object {
                $displayName = $_.PSObject.Properties["DisplayName"]
                $null -ne $displayName -and $displayName.Value -like "Statusline Companion*"
            } |
            Select-Object -First 1
        if ($null -ne $entry) {
            return $entry
        }
    }
    return $null
}

function Get-OptionalEntryValue {
    param(
        [Parameter(Mandatory = $true)]$Entry,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Entry.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function ConvertFrom-RegistryPath {
    param(
        [AllowEmptyString()][string]$Value,
        [switch]$RemoveIconIndex
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }
    $normalized = if ($RemoveIconIndex) {
        $Value -replace ",[0-9]+$", ""
    }
    else {
        $Value
    }
    return $normalized.Trim().Trim([char]0x22)
}

function Wait-ForStatuslineEntry {
    param([Parameter(Mandatory = $true)][bool]$Present)

    for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
        $entry = Get-StatuslineUninstallEntry
        if ($Present -and $null -ne $entry) {
            return $entry
        }
        if (-not $Present -and $null -eq $entry) {
            return $null
        }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for the Statusline uninstall entry (present=$Present)"
}

function Get-StatuslineExecutable {
    param([Parameter(Mandatory = $true)]$Entry)

    $candidates = @()
    $displayIcon = ConvertFrom-RegistryPath `
        -Value (Get-OptionalEntryValue -Entry $Entry -Name "DisplayIcon") `
        -RemoveIconIndex
    $installLocation = ConvertFrom-RegistryPath `
        -Value (Get-OptionalEntryValue -Entry $Entry -Name "InstallLocation")
    if (-not [string]::IsNullOrWhiteSpace($displayIcon)) {
        $candidates += $displayIcon
    }
    if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
        $candidates += Join-Path $installLocation "Statusline Companion.exe"
        $candidates += Get-ChildItem `
            -LiteralPath $installLocation `
            -Filter "*.exe" `
            -File `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike "*uninstall*" } |
            ForEach-Object FullName
    }
    $candidates += Join-Path $env:LOCALAPPDATA "Statusline Companion\Statusline Companion.exe"
    $candidates += Join-Path $env:ProgramFiles "Statusline Companion\Statusline Companion.exe"

    $executable = $candidates |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if ($null -eq $executable) {
        throw "The installer registered Statusline but its executable was not found"
    }
    return $executable
}

function Assert-AppStarts {
    param([Parameter(Mandatory = $true)][string]$Executable)

    $process = Start-Process -FilePath $Executable -PassThru
    Start-Sleep -Seconds 4
    $process.Refresh()
    if ($process.HasExited) {
        throw "Statusline exited during the four-second launch smoke test"
    }
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
}

function Uninstall-Nsis {
    param([Parameter(Mandatory = $true)]$Entry)

    $uninstallCommand = Get-OptionalEntryValue -Entry $Entry -Name "UninstallString"
    if ($uninstallCommand -match '^"([^"]+\.exe)"') {
        $uninstaller = $Matches[1]
    }
    elseif ($uninstallCommand -match '^(.+?\.exe)(?:\s|$)') {
        $uninstaller = $Matches[1]
    }
    else {
        throw "Could not parse the NSIS uninstall command"
    }
    Invoke-CheckedProcess -FilePath $uninstaller -Arguments @("/S")
}

$bundleRootPath = (Resolve-Path -LiteralPath $BundleRoot).Path
$nsis = Get-SingleBundle -Directory $bundleRootPath -Filter "*.exe"
$msi = Get-SingleBundle -Directory $bundleRootPath -Filter "*.msi"
$msiInstallLog = Join-Path ([IO.Path]::GetTempPath()) "statusline-msi-install-$PID.log"
$msiUninstallLog = Join-Path ([IO.Path]::GetTempPath()) "statusline-msi-uninstall-$PID.log"

Write-Host "Smoke testing NSIS install, launch and uninstall."
$nsisInstalled = $false
$msiInstalled = $false
try {
    $nsisInstalled = $true
    Invoke-CheckedProcess -FilePath $nsis -Arguments @("/S")
    $nsisEntry = Wait-ForStatuslineEntry -Present $true
    Assert-AppStarts -Executable (Get-StatuslineExecutable -Entry $nsisEntry)
    Uninstall-Nsis -Entry $nsisEntry
    $nsisInstalled = $false
    Wait-ForStatuslineEntry -Present $false | Out-Null

    Write-Host "Smoke testing MSI install, launch and uninstall."
    $msiInstalled = $true
    Invoke-MsiPackage `
        -Action "install" `
        -PackagePath $msi `
        -LogPath $msiInstallLog
    $msiEntry = Wait-ForStatuslineEntry -Present $true
    Assert-AppStarts -Executable (Get-StatuslineExecutable -Entry $msiEntry)
    Invoke-MsiPackage `
        -Action "uninstall" `
        -PackagePath $msi `
        -LogPath $msiUninstallLog
    $msiInstalled = $false
    Wait-ForStatuslineEntry -Present $false | Out-Null
}
finally {
    if ($msiInstalled) {
        try {
            Invoke-MsiPackage `
                -Action "uninstall" `
                -PackagePath $msi `
                -LogPath $msiUninstallLog `
                -AllowedExitCodes @(0, 1605, 3010)
        }
        catch {
            Write-Warning "MSI cleanup failed: $($_.Exception.Message)"
        }
    }
    if ($nsisInstalled) {
        try {
            $cleanupEntry = Get-StatuslineUninstallEntry
            if ($null -ne $cleanupEntry) {
                Uninstall-Nsis -Entry $cleanupEntry
            }
        }
        catch {
            Write-Warning "NSIS cleanup failed: $($_.Exception.Message)"
        }
    }
    foreach ($logPath in @($msiInstallLog, $msiUninstallLog)) {
        if (Test-Path -LiteralPath $logPath -PathType Leaf) {
            Remove-Item -LiteralPath $logPath -Force
        }
    }
}

Write-Host "Windows installer smoke tests passed."
