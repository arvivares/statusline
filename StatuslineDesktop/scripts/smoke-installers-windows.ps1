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

    $files = @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File)
    if ($files.Count -ne 1) {
        throw "Expected one $Filter file in $Directory, found $($files.Count)"
    }
    return $files[0].FullName
}

function Invoke-CheckedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [int[]]$AllowedExitCodes = @(0)
    )

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -Wait `
        -PassThru
    if ($process.ExitCode -notin $AllowedExitCodes) {
        throw "$FilePath exited with code $($process.ExitCode)"
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
    $displayIcon = Get-OptionalEntryValue -Entry $Entry -Name "DisplayIcon"
    $installLocation = Get-OptionalEntryValue -Entry $Entry -Name "InstallLocation"
    if (-not [string]::IsNullOrWhiteSpace($displayIcon)) {
        $candidates += ($displayIcon -replace ",[0-9]+$", "").Trim('"')
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
$nsis = Get-SingleBundle -Directory (Join-Path $bundleRootPath "nsis") -Filter "*.exe"
$msi = Get-SingleBundle -Directory (Join-Path $bundleRootPath "msi") -Filter "*.msi"

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
    Invoke-CheckedProcess `
        -FilePath "msiexec.exe" `
        -Arguments @("/i", $msi, "/qn", "/norestart") `
        -AllowedExitCodes @(0, 3010)
    $msiEntry = Wait-ForStatuslineEntry -Present $true
    Assert-AppStarts -Executable (Get-StatuslineExecutable -Entry $msiEntry)
    Invoke-CheckedProcess `
        -FilePath "msiexec.exe" `
        -Arguments @("/x", $msi, "/qn", "/norestart") `
        -AllowedExitCodes @(0, 3010)
    $msiInstalled = $false
    Wait-ForStatuslineEntry -Present $false | Out-Null
}
finally {
    if ($msiInstalled) {
        try {
            Invoke-CheckedProcess `
                -FilePath "msiexec.exe" `
                -Arguments @("/x", $msi, "/qn", "/norestart") `
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
}

Write-Host "Windows installer smoke tests passed."
