# Read-only, current-user package metadata. No elevation, profile, credentials,
# process command lines, recursive WindowsApps scan or hard-coded version paths.
# Statusline embeds this script and invokes the system Windows PowerShell with
# -NoProfile -NonInteractive. Running it manually prints local installation paths;
# redact your Windows username before sharing the result.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$names = @('OpenAI.ChatGPT-Desktop', 'OpenAI.ChatGPT', 'OpenAI.Codex')
$packages = @(Get-AppxPackage -Name 'OpenAI.*' -PackageTypeFilter Main |
    Where-Object { $_.Name -in $names -and $_.InstallLocation } |
    Sort-Object -Property @{ Expression = { [version]$_.Version }; Descending = $true } |
    Select-Object -First 16 -Property Name, InstallLocation)
ConvertTo-Json -InputObject $packages -Compress
