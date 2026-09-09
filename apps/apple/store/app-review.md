# App Review information

## Contact

- Name: Alan Rodrigo Vivares
- Email: `founder@inmerzion.io`
- Phone: enter the verified international-format number directly in App Store Connect; do not version it here.
- Sign-in required: No
- Demo account: Not applicable

## Review Notes

App Review update - 7 September 2026 - version 1.0 (4)
Build 4 replaces build 2 after TestFlight testing on a physical iPhone. It updates the shared Statusline icon and adds English/Spanish localization to the app and widget, with English as the fallback for other system languages. Core functionality and data handling are unchanged.
China mainland remains excluded following the alternative in your 5 September review message (Guideline 5). All other selected storefronts are unchanged.
Statusline displays Codex usage/quota metadata; it does not offer chat or generate text, images or code.

APP REVIEW INFORMATION

Screen recording
A 52-second physical-iPhone recording remains attached in App Review Information and the Resolution Center reply. Recorded before build 4, it shows the same core flow: launching Statusline from the Home Screen, QR pairing with Companion, receiving/refreshing a quota snapshot, and adding/viewing the widget. The icon and localized labels are updated in build 4; this is not a new recording of that build.

Purpose and target audience
Statusline is an independent, open-source utility for developers who use Codex CLI. It shows remaining weekly quota, reset time, and last update in a focused iPhone dashboard and widget, avoiding repeated trips to the desktop terminal to check /status.

Setup and access
Statusline has no account registration, login, account deletion, subscription, in-app purchase, advertising, or paid content. No review credentials or sample files are required.

To review without external setup:

1. Launch the app.
2. Tap "View local demo" / "Ver demo local" in the first quota panel.
3. The app stores a clearly labeled sample locally and updates the widget.
4. Add the Statusline widget from the iPhone Home Screen.
   The manual editor under "Manual update" / "Actualización manual" also accepts a complete weekly-limit line.

Optional live sync:

1. Install and authenticate Codex CLI on Windows, Linux, or macOS using the reviewer's own Codex/ChatGPT account.
2. Run the open-source Statusline Companion.
3. Select Connections > Codex Source, then Universal Relay > Create pairing.
4. On iPhone tap "Scan QR" / "Escanear QR" and scan the temporary QR code, or paste its private link.
5. Refresh the Companion and iPhone app.

External services, tools, and platforms

- OpenAI Codex CLI / local Codex App Server: Companion reads only quota metadata from the user's already authenticated local session. Statusline never receives Codex credentials, API keys, prompts, conversations, or source code.
- Cloudflare Workers and D1: the optional Statusline Relay transports an AES-256-GCM encrypted quota snapshot. It stores credential hashes, operational timestamps, and opaque ciphertext only; it never receives the encryption key or plaintext snapshot.
- Apple camera APIs: used only after the user chooses QR scanning. Camera frames are processed on device and not stored by Statusline.
- WidgetKit, App Groups, and Keychain: used for the native widget, private local cache, and local secret storage.

Regional differences
Statusline is not distributed on the China mainland App Store. Within the selected storefronts, its features, content and price are consistent.

Regulated industry / protected third-party material
Statusline is not a regulated-industry app and does not distribute protected third-party content. It is an independent interoperability utility and is not affiliated with, sponsored by, or endorsed by OpenAI. "OpenAI," "ChatGPT," and "Codex" identify compatibility with the user's locally installed software.

Privacy policy: https://statusline-relay.inmerzion.workers.dev/privacy
Source and setup documentation: https://github.com/arvivares/statusline
