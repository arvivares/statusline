# Statusline — Amber Operator Variations

**Status:** In review
**Date:** 2026-08-29
**Parent direction:** Amber Operator
**Surfaces:** iPhone app, Home Screen widget, macOS companion

## Refinement brief

- **Keep:** warm-black canvas, accessible amber signal, square 20-segment meter, coordinate-style metadata, and compact expert-tool tone.
- **Change:** information density, relationship between quota and reset, and strength of the underlying grid.
- **Avoid:** military visual language, faux hardware, cyberpunk decoration, unnecessary warnings, and unreadably small telemetry.
- **Primary job:** communicate `53% left` and `resets 09:02 on 2 Sep` immediately.
- **Accessibility:** WCAG 2.2 AA, 44-point controls, explicit status text, locale-aware dates, and reduced-motion alternatives.

## 07 — Operator Zero

Amber Operator stripped to its essential instrument. Large quota, one horizontal meter, one reset row, and almost no visible grid.

- Signature: a single amber datum line crossing the interface.
- Density: low.
- Character: calm, premium, exact.
- Best for: the cleanest App Store-ready interpretation.

## 08 — Telemetry Grid

Amber Operator at maximum useful density. Quota, reset, source, relay, and sample age are arranged in a strict telemetry matrix.

- Signature: an indexed 20-cell meter embedded in a coordinate grid.
- Density: high but ordered.
- Character: technical, analytical, active.
- Best for: expert users who want system context at a glance.

## 09 — Reset Chronograph

Quota and reset time become equal protagonists. A restrained chronograph dial communicates the next reset while the segmented rail preserves the Codex lineage.

- Signature: reset-time dial paired with the exact quota rail.
- Density: medium.
- Character: precise, temporal, distinctive.
- Best for: a memorable widget and strong cross-surface identity.

## Shared implementation boundary

- All variants use the same quota, reset, sync, and account data already available.
- Visual composition changes only; CloudKit, Codex authentication, parsing, timeline scheduling, and privacy behavior remain untouched.
- The selected layout must accommodate waiting, syncing, empty, warning, critical, and error states without rearranging the primary metric.

## Decision required

Choose 07, 08, or 09. The selected direction will then receive state refinement and native SwiftUI implementation.

## Prototype QA

- Verified every direction at 1440 × 1000 and 390 × 844.
- Corrected the only desktop composition overlap in the 09 title; product surfaces were unaffected.
- No horizontal clipping, hidden actions, or truncated quota/reset values.
- Primary, secondary, and amber signal colors pass WCAG 2.2 AA; the lowest normal-text contrast is 6.35:1.
- Motion is decorative state feedback only and is removed under `prefers-reduced-motion`.
- The 09 dial labels a reset event and intentionally does not imply countdown progress.
- Recommendation: 07 is the strongest overall product direction; the 09 reset dial is the strongest optional widget signature.
