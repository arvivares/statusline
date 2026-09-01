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

## Android widget parity refinement

**Status:** Approved by the existing Data Plane decision and implemented on 2026-08-31.

The iOS WidgetKit implementation is the canonical composition. Android maps its resizable widget to three information densities instead of stretching one layout:

- **Compact (default 4×1):** remaining percentage, weekly meter and reset timestamp share one horizontal scan line.
- **Small:** `WEEKLY LIMIT` and `LIVE`, dominant remaining percentage, 20-cell meter, then reset time and date.
- **Medium:** `REMAINING` and percentage at left, weekly meter and scale in the center, then a ruled `RESETS` column at right.
- **Empty:** stable weekly-limit hierarchy, `NO DATA`, empty 20-cell meter and one `CONNECT COMPANION` recovery label.

All Android layouts reuse the exact Data Plane color roles, rounded system numeral, monospaced operational labels, 18-point coordinate grid, amber/critical threshold and one combined accessibility description. Android 12 and later receive responsive `RemoteViews` keyed to launcher-provided width and height; older versions select the same buckets from widget options. The picker requests 4 columns × 1 row by default. Below 110 dp it uses Compact; at taller sizes, the 270 dp width boundary selects Small or Medium. Vertical resizing remains enabled so users can move between those densities.
