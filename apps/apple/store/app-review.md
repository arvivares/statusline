# App Review information

## Contact

- Name: Alan Rodrigo Vivares
- Email: `founder@inmerzion.io`
- Phone: enter the verified international-format number directly in App Store Connect; do not version it here.
- Sign-in required: No
- Demo account: Not applicable

## Review Notes

App Review preparation - 10 September 2026 - version 1.0.1 (5)
This update adds independent widget refresh, existing-pairing migration, foreground refresh and website privacy/support links. Open the app once after upgrading to migrate the existing pairing for widget access. WidgetKit controls the refresh schedule; updates are not real-time. The English listing is named "Statusline: Agent Quota"; this release supports Codex only. Statusline does not offer chat or generate text, images or code.

APP REVIEW INFORMATION

Screen recording
A 52-second physical-iPhone recording was provided with the original submission. It shows launch, QR pairing, receiving/refreshing a quota snapshot, and adding/viewing the widget. It predates builds 4 and 5 and does not demonstrate the new background widget behavior. The replacement screenshots show the actual build-5 UI separately in English and Spanish.

Purpose and target audience
Statusline is an independent, open-source utility for developers using Codex. It shows remaining weekly quota, reset time and sample age in an iPhone dashboard and widget, avoiding repeated trips to the computer to check usage.

Setup and access
Statusline has no account registration, login, account deletion, subscription, in-app purchase, advertising, or paid content. No review credentials or sample files are required.

To review without external setup:

1. Launch the app.
2. Tap "View local demo" / "Ver demo local" in the first quota panel.
3. The app stores a 70% example locally and updates the widget.
4. Add the Statusline widget from the iPhone Home Screen.
   The manual editor under "Manual update" / "Actualización manual" also accepts a complete weekly-limit line.

Optional live sync:

1. Have a compatible local Codex installation signed in to your own account. Companion can discover a supported desktop app's bundled runtime; a separate CLI install is not always required.
2. Run the free Statusline Companion on Windows, Linux or macOS.
3. Select Connections > Codex Source, then Universal Relay > Create pairing.
4. On iPhone tap "Scan QR" / "Escanear QR" and scan the temporary QR code, or paste its private link.
5. Keep the computer awake and Companion running to publish samples. The iPhone and widget read the latest encrypted sample independently; iOS chooses widget update times.

External services, tools, and platforms

- OpenAI Codex / local Codex App Server: Companion reads quota metadata from the user's authenticated local session. Codex credentials, API keys, prompts, conversations and source code are never sent to the phone or relay.
- Cloudflare Workers and D1: the optional Statusline Relay transports an AES-256-GCM encrypted quota snapshot. It stores credential hashes, operational timestamps, and opaque ciphertext only; it never receives the encryption key or plaintext snapshot.
- Apple camera APIs: used only after the user chooses QR scanning. Camera frames are processed on device and not stored by Statusline.
- WidgetKit, App Groups, and Keychain: used for the native widget, private local cache, and local secret storage.

Regional differences
Statusline is not distributed on the China mainland App Store. Within the selected storefronts, its features, content and price are consistent.

Regulated industry / protected third-party material
Statusline is not a regulated-industry app and does not distribute protected third-party content. It is an independent interoperability utility and is not affiliated with, sponsored by, or endorsed by OpenAI. "OpenAI," "ChatGPT," and "Codex" identify compatibility with the user's locally installed software.

Privacy policy: https://statusline.inmerzion.io/privacy
Source and setup documentation: https://github.com/arvivares/statusline
