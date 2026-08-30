# Statusline Support

Use [GitHub Issues](https://github.com/arvivares/statusline/issues) for reproducible bugs and installation problems. Before opening an issue, remove account identifiers, API keys, access tokens and private paths that you do not want to share.

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

   Complete **Sign in with ChatGPT** the first time Codex opens.

3. Open **Statusline → Source Settings** and choose **Scan again**. If automatic detection still fails, choose **Select executable**. The official standalone installer currently exposes `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`; npm commonly exposes `%APPDATA%\npm\codex.cmd`.

Statusline verifies the selected launcher with `codex --version` before saving it. npm launchers are accepted only when the adjacent official `@openai/codex` package and a Node.js executable are available.

## Linux and macOS

Install or update the standalone CLI, then run `codex` and sign in:

```shell
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex
```

Statusline detects common standalone, Homebrew, npm, Volta, NVM, FNM, asdf and mise locations. A custom executable can also be selected in **Source Settings**.

## Useful diagnostic details

Include the following in a report:

- operating system and version;
- Statusline version and installer format;
- the output of `codex --version`;
- the **Origin**, **Version** and status shown in Source Settings;
- whether installation, launch, tray behavior or uninstall failed.

Never include the contents of Codex authentication files or any secret value.
