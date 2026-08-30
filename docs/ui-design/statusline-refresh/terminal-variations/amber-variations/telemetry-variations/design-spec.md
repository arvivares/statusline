# Statusline — Telemetry Grid Variations

**Status:** Selected and implemented
**Date:** 2026-08-29
**Parent direction:** Telemetry Grid
**Surfaces:** iPhone app, Home Screen widget, macOS companion

## Refinement brief

- **Keep:** dark coordinate grid, amber active data, 20-cell quota meter, indexed metadata, and expert-tool density.
- **Change:** information architecture—modular plane, chronological stream, or horizontal channels.
- **Primary hierarchy:** quota first, reset second, sync/source context third.
- **Avoid:** decorative cards, military language, arbitrary telemetry, false precision, and metadata too small to read.
- **Accessibility:** WCAG 2.2 AA, 44-point controls, explicit state text, reduced-motion alternatives, and localized operational labels.

## 10 — Data Plane

A balanced modular matrix. Quota occupies the largest cell while reset, relay, source, and sample age occupy smaller aligned regions.

- Signature: asymmetrical data plane with one uninterrupted coordinate system.
- Density: medium-high.
- Character: structured, calm, scalable.
- Best for: the most usable evolution of Telemetry Grid.

## 11 — Event Stream

A chronological interpretation. Quota remains fixed while sync, relay, account, and reset information appear as an ordered event stream.

- Signature: vertical amber timeline with terse status events.
- Density: high, but linear.
- Character: terminal-native, active, transparent.
- Best for: users who care about freshness and sync provenance.

## 12 — Signal Rack

A channel-based instrument. Quota, reset, relay, and account are rendered as horizontal signal bands with consistent labels and endpoints.

- Signature: stacked telemetry rails resembling a clean signal rack.
- Density: high and strongly horizontal.
- Character: technical, distinctive, glanceable.
- Best for: medium widgets and the macOS companion.

## Shared implementation boundary

- Every displayed value already exists in the current model; no invented measurements or false precision.
- Layout and tokens change only. CloudKit, authentication, parser, privacy, and widget timeline behavior remain untouched.
- Waiting, syncing, empty, warning, critical, and error states must preserve quota position and replace only contextual telemetry.

## Decision

**10 — Data Plane** was selected on 2026-08-29 and implemented as the shared visual language for the iPhone app, Home Screen widget, and macOS companion.

- Shared tokens and primitives live in `Shared/DataPlaneDesign.swift`.
- Existing CloudKit, Codex authentication, parsing, persistence, and widget timeline behavior remain unchanged.
- The native implementation includes populated, empty, syncing, waiting, disconnected, and error states.

## Prototype QA

- Rendered all three directions at 1440 × 1000 and 390 × 844.
- Verified no horizontal overflow, clipping, or footer collisions on the iPhone viewport.
- Text/background contrast ranges from 6.46:1 for secondary labels to 15.08:1 for primary text; amber signal contrast is 11.27:1.
- Animated scan indicators are decorative and disabled by `prefers-reduced-motion`.
- The event stream uses categorical labels (`NOW`, `SESSION`, `NEXT`) instead of fabricated timestamps.
- Recommendation: **10 — Data Plane** is the strongest default product direction; **12 — Signal Rack** is the strongest widget/Mac architecture; **11 — Event Stream** is best when sync provenance is the product story.
