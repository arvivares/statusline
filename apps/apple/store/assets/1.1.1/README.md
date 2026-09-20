# iOS 1.1.1 (10) — Still Focus

Five ordered App Store PNGs per locale (`en-US`, `es-ES`), preserving the approved
Still Focus composition, palette, typography and segmented meter. All exports
are opaque RGB, 1320 × 2868. They are not evidence of store publication.

## Native sources and integrity

- App sources `01`, `02`, `03` and `05` were recaptured on 20 September 2026 from
  iOS **1.1.1 (10)**, based on release `v0.1.28` (`a9504722`), with Xcode 27.0
  (`27A266a`) and iOS 27.0 (`24A434`), on the dedicated, unpaired iPhone 17 Pro
  simulator `Statusline README QA`. Native PNGs are 1206 × 2622.
- The guarded `StoreArtworkFixtureTests` seeded synthetic Codex 53% / Gemini 73%
  samples without credentials or a relay channel. Both localized
  `AgentStoreScreenshotTests` passed with no skips. Result bundles:
  `ArtworkSeed.xcresult` and `SimulatorValidatedViews.xcresult`.
- The fixture marker was removed after capture. No real phone data, pairing QR,
  credentials, personal screenshots or private diagnostic logs are included.
- `04-widget.png` deliberately reuses the genuine localized WidgetKit captures
  from [1.1.0](../1.1.0/README.md), captured on 15 September, iOS 26.3.1.
  `CodexStatusWidget`, `AgentWidgetViews.swift` and `AgentWidgetSnapshotLoader.swift`
  have no source changes between that capture's `d90231f3` and this candidate's
  `a9504722`. This is unchanged-UI reuse, not a claim of fresh widget captures.
- Native UI is unretouched. Only proportional framing and crops are applied.
  Version-specific crops keep Scan QR and the legal links fully visible after
  removing the manual quota editor. All ten final compositions were visually
  reviewed, including language, crop bounds and absence of private data.

## Reproduce and validate

Use the guarded capture instructions in [1.1.0](../1.1.0/README.md), then set
`repo_root` to the repository and `artwork_version = "1.1.1"` in the isolated
Browser Use Python session. Serve the repository on `127.0.0.1:8766` and run
`scripts/store-artwork/render-1.1.0.py`. The template accepts
`1.1.0.html?version=1.1.1&lang=en&slide=1` (slides 1–5, languages en/es).

Run `node scripts/store-artwork/validate-1.1.0.mjs 1.1.1` for image integrity,
localized metadata limits and SHA-256 checksums. The original 1.1.0 paths remain
the default, so historical exports are not overwritten by the new version.

Upload the five locale-level exports to the matching 6.9-inch slot, never the
`source/` folder. See [delivery evidence](../../validation-1.1.1.md) for actual
store status and the separate physical-device checks.
