# iOS 1.1.0 (9) — App Store submission

## Scope and evidence — 15 September 2026

- Production source: `d90231f30db5e4b9b668811003a6577ca346c0fe`, merged PR #50.
- The existing distribution build **1.1.0 (9)** completed TestFlight processing;
  its ID is `faa24b8e-c874-4db0-a675-9bcd7e09813c`.
- The developer confirmed the TestFlight app works on their physical iPhone.
  This is user-reported QA, not a claim of a newly measured background-refresh
  interval or new Windows/Linux device tests.
- Companion [0.1.24](https://github.com/arvivares/statusline/releases/tag/v0.1.24)
  and the compatible services-v1 relay are already distributed/deployed. Existing
  Codex slots, channels and pairing credentials were preserved.
- The user authorized App Store submission after physical QA and requested that
  the existing **Still Focus** screenshot aesthetic be retained.
- No new distribution archive, IPA upload, release tag, mobile version bump,
  Android rollout, Companion installer or relay deployment was needed here.

## Store assets and text

- [English listing](listing/en-US.md), [Spanish listing](listing/es-ES.md) and
  [review notes](release-notes/1.1.0-review.txt) cover Codex and Gemini from
  Antigravity, provider visibility, reset/sample age, encrypted sync and widgets.
- Local/demo/manual data remains Codex-only. Antigravity requires Companion
  0.1.24 or later and the user's compatible signed-in installation.
- [Ten screenshots](assets/1.1.0/README.md): five per language, 1320 × 2868 RGB
  PNGs, no alpha, current native app and actual WidgetKit sources, synthetic data.
- Both app capture flows and the Spanish Home Screen widget capture passed on
  the isolated iPhone simulator. All exports were visually reviewed; dimensions,
  filenames, count and PNG integrity were checked with the versioned validator.
- The existing physical-iPhone review video predates this design and Antigravity;
  review notes explicitly distinguish it from build 9 and the new screenshots.

## App Store Connect submission receipt

- Submitted **15 September 2026 at 17:51 Europe/Madrid**; confirmed on the
  App Review receipt as **Waiting for Review**, with one item: **1.1.0 (9)**.
- Submission ID: `8931776e-9fcd-44fd-ab86-d1c956671b2d`.
- Existing public version observed: **1.0.3**, Ready for Distribution. Approval
  or public availability of 1.1.0 has not yet been established.
- Existing build **9 / 1.1.0** selected, not rebuilt or uploaded again. Both
  **Add for Review** and the final **Submit for Review** were completed.
- EN-US and ES-ES descriptions, promotional text, keywords, what's new and shared
  review notes were saved and compared exactly with the versioned source after
  reloading. Both new subtitles were also verified after reloading; names remain
  `Statusline` (Spanish) and `Statusline: Agent Quota` (English).
- Five screenshots per locale finished processing, in order: quota, Gemini,
  pairing, widget, privacy. The 6.5-inch slot uses that locale's 6.9-inch set.
- The existing physical-iPhone recording was reattached and its completed
  attachment verified after reloading. Its age is disclosed in the review notes.
- Names, website URLs, contacts, categories, pricing and availability are retained.
- Release policy inherited from the previous version: automatic after approval,
  all users immediately (not phased), keep existing ratings. This is not an
  immediate public release while review is pending.

## Local validation

- Opt-in synthetic fixture seed and both localized native-app capture flows:
  passed on the isolated simulator. Spanish Home Screen widget capture: passed.
- Versioned store-artwork validator: ten opaque RGB 1320 × 2868 PNGs, exact file
  count and order, complete PNG chunks and localized metadata field limits passed.
- Apple bundle/configuration regression guard: **23 tests passed**, none skipped.
- Markdown links, formatting and `git diff --check`: passed.
- Capture opt-in marker removed; the isolated simulator's original system locale
  restored and simulator shut down. No physical-device data or pairing was changed.

## Follow-up

Wait for Apple's review result. If approved, the inherited automatic-release
policy applies; verify public availability separately before announcing 1.1.0 as
released. This submission does not change the Android testing track.
