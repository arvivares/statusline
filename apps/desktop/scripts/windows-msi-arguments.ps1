# Windows Installer does not use the C-runtime backslash-quote convention used
# by ProcessStartInfo.ArgumentList. Property values use doubled literal quotes.
# https://learn.microsoft.com/windows/win32/msi/command-line-options
function ConvertTo-WindowsInstallerArguments {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $encoded = foreach ($argument in $Arguments) {
        if ([string]::IsNullOrEmpty($argument) -or $argument -match '[\x00\r\n]') {
            throw "Invalid Windows Installer argument"
        }
        if ($argument -cmatch '^([A-Z][A-Z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Replace('"', '""')
            $name + '="' + $value + '"'
        }
        else {
            if ($argument.Contains('"')) {
                throw "Quotes are only allowed inside Windows Installer property values"
            }
            if ($argument -match '\s') { '"' + $argument + '"' } else { $argument }
        }
    }
    return ($encoded -join ' ')
}
