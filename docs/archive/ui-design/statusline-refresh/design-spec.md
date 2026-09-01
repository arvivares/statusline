# Statusline UI Refresh

**Status:** In review
**Date:** 2026-08-29
**Surfaces:** iPhone app, Home Screen widget, macOS companion

## Ground

- The product exists to answer one question instantly: how much weekly Codex capacity remains, and when does it reset?
- The original Codex status line is the visual canon: monospaced, compact, explicit, and calm.
- The current implementation already handles sync and fallback states; this refresh changes hierarchy and presentation, not the data flow.

## Creative brief

- **Primary job:** make `53% left` and `resets 09:02 on 2 Sep` understandable in under one second.
- **Audience:** Codex users who recognize terminal language but expect a polished native Apple utility.
- **Emotion:** precise, quiet, trustworthy.
- **Signature:** one shared “usage line” composed of label, segmented bar, percentage, and reset time.
- **Avoid:** decorative gradients, repeated cards, oversized iconography, generic dashboard chrome, and animation without information value.
- **Constraints:** SwiftUI on iOS/iPadOS 26.2 and macOS 15; WidgetKit small and medium; Dynamic Type; VoiceOver; light and dark appearance.

## Design system packet

### Scope

- **Primary mode:** cross-surface alignment with shared foundations.
- **Shared goal:** the app, widget, and companion should feel like three densities of the same instrument.

### Foundations

- Use semantic roles (`canvas`, `surface`, `ink`, `muted`, `signal`, `critical`) rather than per-screen colors.
- Use monospaced type for measurements, timestamps, status labels, and the usage bar. Use the system text face only for explanatory copy.
- Use an 8-point spacing rhythm. Corners are restrained; borders and whitespace provide structure before shadows or materials.
- Motion is limited to state changes: numeric replacement, sync progress, and disclosure. Respect Reduce Motion.
- Color never carries quota meaning alone; percentage text and accessible labels remain explicit.

### Shared primitives

- `UsageLine`: weekly label + segmented progress + remaining percentage.
- `ResetStamp`: localized reset date with compact and expanded variants.
- `SyncIndicator`: state dot/icon + short status copy + optional refresh action.
- `UtilitySection`: product-local grouping primitive with one border treatment and no nested cards.

New shared tokens or primitives should require reuse on at least two of the three surfaces. Authentication controls and manual-entry fields stay local to their workflows.

### Surface guidance

- **iPhone:** one dominant usage composition; sync is a compact secondary row; manual fallback remains discoverable but visually tertiary.
- **Widget:** no navigation or explanation. Read remaining quota first and reset second. The medium family may echo the original status line literally.
- **Mac companion:** connection state and sync action remain operationally primary; quota uses the same visual grammar as iPhone at denser desktop scale.

### Accessibility baseline

- Support Dynamic Type without clipping the value or reset date.
- Minimum 44-point touch targets for interactive controls.
- Combine the visual bar into one VoiceOver element: “Weekly Codex limit, 53 percent remaining, resets …”.
- Maintain at least 4.5:1 text contrast and 3:1 non-text UI contrast.
- Provide text or symbols alongside every color-coded state.

## Directions

### 01 — Terminal Editorial

Closest to Codex itself. Charcoal canvas, warm off-white type, signal green, literal bracketed block bar, hairline rules, and almost no curvature. The memorable moment is the original status line promoted into a premium instrument.

### 02 — Quiet Native

An Apple-utility interpretation. Warm paper surfaces, generous whitespace, a restrained sage signal, serif numerals paired with monospaced metadata, and a continuous progress rule. It feels softer and more approachable while retaining technical precision.

### 03 — Swiss Instrument

A high-contrast information-design interpretation. Ivory grid, black typography, vermilion signal, square segmented meter, and assertive numeric hierarchy. It is the most distinctive and editorial direction while remaining simple.

## States to preserve in implementation

- Loading/checking account.
- No Mac data yet, with one clear recovery instruction.
- Connected and synced.
- Syncing.
- Cloud or account error, with retry.
- Manual paste fallback, feedback success, and validation failure.
- Quota warning at 40% and critical at 20%, without changing layout.

## Decision required

Choose direction 01, 02, or 03. The selected direction will be translated into shared SwiftUI primitives and applied to all three targets.

## Prototype QA

- Desktop compositions verified at 1440 × 1000 for iPhone, medium widget, and macOS companion.
- Mobile compositions verified at 390 × 844 with no horizontal clipping after correcting the shared responsive boundary.
- Primary, secondary, and signal text colors were contrast-checked. Normal text meets at least 4.5:1; large text and UI signals meet at least 3:1.
- The connected/current state is represented in every prototype. Loading, empty, syncing, warning, critical, and error states remain implementation variants of the same hierarchy.
- All user-facing copy will remain localizable. The English Codex status line may appear as a visual source reference, while VoiceOver and operational labels use the app locale.

## SwiftUI translation notes

- Keep `CodexStatusViewModel` ownership and sync behavior unchanged; this pass is view composition only.
- Implement `UsageLine`, `ResetStamp`, and `SyncIndicator` as small shared `View` structs instead of computed `@ViewBuilder` sections.
- Use semantic SwiftUI text styles with monospaced design, locale-aware `Text` date/number formats, `foregroundStyle`, and semantic colors. Do not introduce UIKit colors or fixed screen-width reads.
- Build the segmented meter with a stable 20-item range and flexible frames; no `GeometryReader` is required.
- Use `ViewThatFits` where compact widget text needs to collapse, and combine the meter into one explicit accessibility element.
- Keep actions as `Button` controls with 44-point targets. Numeric transitions and sync feedback must use value-scoped animation and respect Reduce Motion.
- Direction 01 is the recommended implementation because it best matches the supplied Codex reference while producing the smallest, most coherent shared system.
