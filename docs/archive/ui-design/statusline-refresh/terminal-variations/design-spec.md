# Statusline — Terminal Editorial Variations

**Status:** In review
**Date:** 2026-08-29
**Parent direction:** Terminal Editorial
**Surfaces:** iPhone app, Home Screen widget, macOS companion

## Refinement brief

- **Keep:** near-black canvas, monospaced information, quiet status signals, exact Codex quota language, and one coherent family across Apple surfaces.
- **Change:** explore hierarchy, density, accent color, and how literally the UI behaves like a terminal.
- **Tone:** technical and premium; never nostalgic cosplay, noisy cyberpunk, or generic dashboard UI.
- **Primary job:** communicate `53% left` and `resets 09:02 on 2 Sep` in under one second.
- **Accessibility:** WCAG 2.2 AA contrast, 44-point actions, explicit text alongside status color, reduced-motion alternative.

## 04 — Phosphor Console

The most literal Codex interpretation. A command prompt and its response become the hero, rendered in phosphor green on a deep neutral canvas. Operational details appear as terse command output instead of cards.

- Signature: `/status` prompt followed by the exact quota line.
- Density: compact and terminal-native.
- Accent: phosphor green.
- Best for: maximum affinity with the Codex CLI.

## 05 — Midnight Ledger

The most refined interpretation. The interface behaves like an editorial data ledger: oversized quota, generous negative space, restrained mint signal, hairline rules, and carefully aligned metadata.

- Signature: a large `53` paired with a thin typographic usage rail.
- Density: calm and spacious.
- Accent: pale mint on blue-black.
- Best for: a premium App Store presence without losing Codex character.

## 06 — Amber Operator

The most instrumental interpretation. A compact operations console uses amber as its only signal, modular coordinates, square meters, and dense but disciplined sync information.

- Signature: amber segmented meter with reset coordinates.
- Density: high, with explicit operational hierarchy.
- Accent: accessible amber.
- Best for: users who want an expert tool rather than a passive glanceable display.

## Shared implementation boundary

- The quota value, segmented meter, reset stamp, and sync state remain shared primitives.
- Each variant changes only visual tokens and composition; parsing, CloudKit, authentication, and timeline behavior remain untouched.
- The selected direction must support connected, syncing, waiting, empty, warning, critical, and error states without changing the main layout.

## Decision required

Choose 04, 05, or 06. The selected branch will then receive state refinement and native SwiftUI implementation.

## Prototype QA

- Verified every direction at 1440 × 1000 and 390 × 844.
- No horizontal clipping, truncated status values, or hidden primary actions.
- Primary, secondary, and signal colors pass WCAG 2.2 AA; the lowest normal-text contrast is 5.62:1.
- Motion is limited to cursor, sweep, or scan feedback and is removed under `prefers-reduced-motion`.
- All three compositions map to the existing shared quota, reset, and sync primitives without changing product behavior.
- Recommendation: 05 offers the strongest balance of Codex affinity, glanceability, and premium App Store presentation.
