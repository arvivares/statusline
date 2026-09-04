# Google Play release kit

This directory is the versioned source of truth for the Statusline Google Play listing. The current kit targets `inmerzion.statusline` version `0.1.10` (`versionCode 6`).

## Contents

- `listing/`: default English listing and Spanish localization.
- `release-notes/`: localized notes for the current bundle.
- `app-content.md`: answers used for Play Console policy forms.
- `data-safety.md`: SDK and relay data inventory plus the declarations submitted to Google.
- `review-access.md`: reviewer instructions for the account-free local demo.
- `assets/source/`: deterministic source for generated artwork.
- `assets/app-icon.png`: 512 × 512 Play icon.
- `assets/feature-graphic.png`: 1024 × 500 feature graphic.
- `assets/phone/`: 1080 × 1920 portrait screenshots in listing order.

The screenshots are captured from the real Android build. Generated artwork uses the same Data Plane tokens as the product and does not contain the OpenAI logo or imply affiliation.

The feature graphic is declared in Play Console as created or edited using AI. The app icon and four screenshots are not: the screenshots come from the physical Android build and the icon is the existing Statusline product artwork.

## Current Play submission

On 2 September 2026, bundle `0.1.10` (`versionCode 6`) was submitted as closed-track release `0.1.10-alpha.1` together with the default `en-US` listing, app-content forms and Data safety declaration. The track targets all 177 available countries and regions and uses the private `Statusline Internal` email list.

The only bundle warning is the absence of native debug symbols for third-party native code. It does not block closed testing, but should be investigated before production so native crashes and ANRs have the best available diagnostics.

Before submitting a new build, update the version references, release notes and screenshots, then recheck the live Data safety form against every bundled SDK and the deployed relay.
