# Security policy

Statusline handles local usage metadata and optional encrypted device pairing. Security
reports are taken seriously and should be disclosed privately.

## Supported versions

Security fixes target the latest public release and the current `main` branch. Pre-release
builds may change quickly; users should reproduce an issue on the newest available build
before reporting it when practical.

## Report a vulnerability

Email [founder@inmerzion.io](mailto:founder@inmerzion.io) with the subject
`[Statusline Security]`.

Include, when available:

- the affected component, version, platform and installation format;
- a concise impact assessment and reproducible steps;
- proof-of-concept material that does not expose real user credentials or data;
- any suggested mitigation;
- a safe way to contact you for follow-up.

Do not include API keys, Codex access tokens, real pairing links, QR codes, signing keys,
keystores or unrelated personal data. If sensitive evidence must be transferred, first ask
for an appropriate secure channel.

We aim to acknowledge a report within three business days and provide an initial
assessment within fourteen days. Timelines for remediation and disclosure depend on
severity, reproducibility and cross-platform impact.

## Scope

Reports concerning these maintained components are in scope:

- the Tauri desktop companion and its installers;
- iPhone and Android applications and widgets;
- the Statusline Relay protocol and reference Cloudflare deployment;
- credential storage, pairing, encryption and update integrity;
- the build, signing and release pipeline.

Vulnerabilities in Codex, OpenAI services, operating systems, Cloudflare, app stores or
other upstream dependencies should also be reported to their respective maintainers.
Statusline is an independent project and cannot accept reports on their behalf.

## Coordinated disclosure

Please allow a reasonable remediation window before public disclosure. The project will
work with reporters in good faith, credit them when requested and publish relevant fixes
and release notes. Statusline does not currently operate a paid bug-bounty program.

For ordinary bugs and support requests, use the public issue templates or
[SUPPORT.md](SUPPORT.md).
