# App Review information

## Contact

- Name: Alan Rodrigo Vivares
- Email: `founder@inmerzion.io`
- Phone: enter the verified international-format number directly in App Store Connect; do not version it here.
- Sign-in required: No
- Demo account: Not applicable

## Review Notes

Statusline has no login, subscription, in-app purchase or paid content.

To review the full local experience without a desktop, account or network:

1. Launch the app.
2. Tap **Ver demo local** in the first quota panel.
3. The app stores a clearly labeled 70% sample locally and updates the Statusline home-screen widget.
4. Add the widget from the iPhone Home Screen to verify the same quota and reset time.

The manual quota editor under **Actualización manual** is also fully functional and accepts the complete weekly-limit line returned by `/status`.

QR pairing is an optional encrypted synchronization method. Tap **Escanear QR** to inspect the scanner; a manual-link fallback remains available if camera access is denied. Real sync uses the separately distributed open-source Statusline Companion for Windows, Linux or macOS and the live HTTPS relay at `https://statusline-relay.inmerzion.workers.dev`. The mobile app remains useful without Companion through local input and its widget.

Statusline never requests or receives Codex credentials, API keys, prompts, source code or conversation history. The relay receives random credentials and opaque AES-256-GCM ciphertext but never the encryption key. Privacy and support links are available from the main screen.

Statusline is an independent open-source project and is not affiliated with, endorsed by or sponsored by OpenAI. It uses no OpenAI logo. Source and protocol documentation: https://github.com/arvivares/statusline
