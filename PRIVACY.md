# Statusline Companion — Privacy

Effective date: 30 August 2026

Statusline Companion is designed to display Codex quota metadata without collecting account credentials.

## Data processed locally

The desktop companion starts the locally installed Codex App Server and reads only the fields needed to show usage windows, reset times, account type and plan. It does not read, copy or store Codex access tokens, API keys, prompts, source code or conversation content.

When a user selects a Codex executable manually, Statusline stores that local file path in its application configuration directory. The path remains on that computer and can be cleared with **Source Settings → Use automatic detection**.

## Network and analytics

Statusline Companion has no analytics SDK, advertising SDK or Statusline-operated backend. The Codex CLI may communicate with OpenAI using the user's existing local session; that communication is controlled by Codex and the user's OpenAI account. Statusline communicates with the CLI through local standard input and output.

The current Windows and Linux companion does not sync data to iPhone or Android. The separate Apple companion can publish quota-only samples to the user's private iCloud database when that feature is enabled.

## Retention and deletion

Quota samples shown by the Windows and Linux desktop companion are held in memory for the running session. Uninstalling the application removes the application binaries. A user can also delete the Statusline configuration directory to remove the selected executable path.

## Support

Privacy questions and reports can be submitted through the project support channel described in [SUPPORT.md](SUPPORT.md). Do not include API keys, access tokens or private Codex configuration in a report.

This notice will be updated before a public release if telemetry, account linking or cross-platform relay functionality is added.
