# Statusline Support

Public support page: https://statusline-relay.inmerzion.workers.dev/support

Public data deletion page: https://statusline-relay.inmerzion.workers.dev/delete-data

Email [founder@inmerzion.io](mailto:founder@inmerzion.io) for reproducible bugs, installation problems and privacy questions. Before sending a report, remove account identifiers, pairing links, QR codes, API keys, access tokens and private paths.

## Codex CLI not found on Windows

1. Install the official standalone CLI in PowerShell:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

2. Open a new terminal and verify the installation:

```powershell
codex --version
codex
```

Complete Sign in with ChatGPT the first time Codex opens.

3. Open Statusline → Connections → Codex Source and choose Scan again. If automatic detection still fails, choose Select executable. The official standalone installer is detected relative to %LOCALAPPDATA%, while npm commonly exposes %APPDATA%\npm\codex.cmd.

Statusline verifies the selected launcher with codex --version before saving it. npm launchers are accepted only when the adjacent official @openai/codex package and a Node.js executable are available.

## Linux and macOS

Install or update the standalone CLI, then run codex and sign in:

```shell
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex
```

Statusline detects common standalone, Homebrew, npm, Volta, NVM, FNM, asdf and mise locations. A custom executable can also be selected in Connections → Codex Source.

## iPhone does not receive the desktop sample

1. Confirm Universal Relay shows a public HTTPS endpoint, not BUILD NOT CONFIGURED.
2. Create a new pairing and scan it within ten minutes. An expired QR cannot be reused.
3. Confirm the desktop changes from PAIRING to CONNECTED after iOS claims the channel.
4. Refresh while Codex is authenticated, then open iOS and press refresh. This version does not yet use push notifications.
5. Ensure desktop and iOS builds use the same STATUSLINE_RELAY_BASE_URL. A link from a different endpoint is rejected.
6. If the channel expired or was deleted, disconnect both sides and pair again.

The same flow works regardless of whether the publisher runs on Windows, Linux or macOS. It does not depend on the Apple ID used by the devices.

## Review or explore Android without a desktop

Use `VIEW DEMO` in Relay Control. Statusline creates a clearly labeled local sample for the app and widget without contacting the relay or using a Codex account. Use `CLEAR DEMO` to remove it; pairing a real device replaces it automatically.

## Delete Statusline data

Statusline has no user account. On Android, use **Relay Control → Disconnect** to remove the reader credential, encryption key and cached quota snapshot. On the paired desktop Companion, use **Universal Relay → Disconnect** to request immediate deletion of the encrypted remote channel and remove the publisher credential.

If the publisher is unavailable, inactive relay channels are automatically deleted after 30 days. The complete steps, retained data and support path are published at https://statusline-relay.inmerzion.workers.dev/delete-data.

## Useful diagnostic details

Include:

- operating system and version;
- Statusline version and installer format;
- the output of codex --version;
- the Origin, Version and state shown in Source Settings;
- the relay hostname and state, but never its full pairing URL;
- whether installation, launch, tray behavior, pairing or refresh failed.

Never include Codex authentication files, secure-store values, a pairing QR or any secret.
