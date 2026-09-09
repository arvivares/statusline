# Website review screenshots

These screenshots document the presentation website introduced by this pull
request. They were captured on 2026-09-05 with headless Google Chrome during the
production verification of the same website sources, before integrating the
latest upstream commits on 2026-09-06.

The displayed quota is explicitly labeled demo data, not a real user's quota.
These are review assets, not generated production bundles; they are outside
`public/` and are not copied into the published website.

- [English desktop, 1440 px](desktop-en.png)
- [Spanish mobile, 390 px](mobile-es.png)

The production verification covered both languages with and without JavaScript,
canonical and alternate URLs, structured data, platform availability, responsive
layout, keyboard interactions, browser history, demo state, accessibility and
Spanish 404 responses. All 21 grouped checks passed.

## App Store download card — 2026-09-09

The download card reuses the README's branded QR and provides a direct App Store
button. iPhone availability is now public; Android remains a beta. Captured from
the local production build with Browser Use and headless Chromium:

- [App Store download, English desktop, 1680 px](app-store-desktop-en.png)
- [App Store download, Spanish mobile, 390 px](app-store-mobile-es.png)

Verified QR loading, localized copy and alternative text, the iOS and Android
destinations, retained platform selection across language changes and keyboard
navigation between platform tabs. No horizontal page overflow was observed at
320, 375, 390, 760, 768, 1024, 1280 or 1680 px. The QR is 196 px on mobile and
245 px on desktop, preserving the canonical SVG and its quiet zone.

Automated checks cover complete static EN/ES HTML, App Store links, bundled QR
byte equality, development-server delivery from both language paths, formatting,
TypeScript, CI scope detection, QR freshness and local Markdown links. The QR's
encoding and logo are unchanged; this review did not include a new physical
camera scan or a production deployment.
