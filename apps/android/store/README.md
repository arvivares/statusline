# Google Play release kit

This directory is the versioned source of truth for the Statusline Google Play listing. The current Play release is `inmerzion.statusline` version `0.1.15` (`versionCode 11`). The repository prepares `0.1.16` (`versionCode 12`) for GitHub APK/AAB distribution; publishing it to Google Play is a separate step and has not been requested for this release.

## Contents

- `listing/`: default English listing and Spanish localization.
- `release-notes/`: localized notes for current and previous bundles.
- [validation-0.1.15.md](validation-0.1.15.md): artifact verification, Play submission evidence and remaining test gates.
- `app-content.md`: answers used for Play Console policy forms.
- `data-safety.md`: SDK and relay data inventory plus the declarations submitted to Google.
- `review-access.md`: reviewer instructions for the account-free local demo.
- `assets/source/`: deterministic source for generated artwork.
- `assets/app-icon.png`: 512 × 512 Play icon.
- `assets/feature-graphic.png`: 1024 × 500 feature graphic.
- `assets/phone/`: 1080 × 1920 portrait screenshots in listing order.

The screenshots are captured from the real Android build. Generated artwork uses the same Data Plane tokens as the product and does not contain the OpenAI logo or imply affiliation.

The official app icon uses the website's segmented gold **S**. Its Play icon,
legacy launcher and adaptive/themed variants are generated together from the
[shared brand kit](../../../branding/README.md). The submission recorded below
updates the bundle and release notes, not the Play listing artwork or screenshots.

The feature graphic is declared in Play Console as created or edited using AI. The app icon and four screenshots are not: the screenshots come from the physical Android build and the icon is the existing Statusline product artwork.

## Current Play submission

On 10 September 2026, the official `v0.1.15` release bundle (`versionCode 11`)
was uploaded and submitted as **`0.1.15-alpha.1`** to **Closed testing — Alpha**,
with [English](release-notes/0.1.15-en-US.txt) and
[Spanish](release-notes/0.1.15-es-ES.txt) release notes.

Play Console initially confirmed **Changes in review**, with automated checks still
running. A later check on 10 September confirmed **Available to selected testers**
on the active Alpha track. The previous available release at submission time was
`0.1.12-alpha.1` (`versionCode 8`). This is not a production rollout.

The rollout targets 100% of the existing Alpha testers across the existing 177
countries and regions. The `Statusline Alpha` and `Statusline Internal` email
lists, production and internal-testing tracks were not changed. Managed
publishing remains off, so the Alpha update is configured to become available
after approval; no production rollout was requested.

Existing eligible testers use the same
[opt-in link](https://play.google.com/apps/testing/inmerzion.statusline) and
[Google Play listing](https://play.google.com/store/apps/details?id=inmerzion.statusline).
An email-list entry alone does not confirm that a tester has opted in.

The only bundle warning is the absence of native debug symbols for third-party native code. It does not block closed testing, but should be investigated before production so native crashes and ANRs have the best available diagnostics.

Before submitting a new build, update the version references, release notes and screenshots, then recheck the live Data safety form against every bundled SDK and the deployed relay.

## Submission history

On 2 September 2026, bundle `0.1.10` (`versionCode 6`) was submitted as closed-track release `0.1.10-alpha.1` together with the default `en-US` listing, app-content forms and Data safety declaration. That submission used the private `Statusline Internal` email list and targeted all 177 available countries and regions.
