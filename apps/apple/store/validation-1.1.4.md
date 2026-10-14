# iOS 1.1.4 (13) — Claude mobile and notification preferences

## Source and package — 13 October 2026

- Source: published [v0.1.39](https://github.com/arvivares/statusline/releases/tag/v0.1.39),
  verified main commit `94de6586c974c0d86a6e923ce9240396c43a7033`, merged
  [PR #107](https://github.com/arvivares/statusline/pull/107).
- One Xcode 27 Release archive, reusing the tested Firebase 12.19.2 package
  checkout with automatic package updates disabled. The same archive was
  exported and uploaded; no second archive or dependency upgrade was used.
- Main bundle `inmerzion.statusline` and widget both declare **1.1.4 (13)**
  and the existing production HTTPS relay. Payload-v1 encryption, pairing and
  provider inventory remain compatible; no relay deployment was performed.
- Exported IPA SHA-256:
  `f01ed8bf3026c1debee4bffce9b0a84d6ef36615dfa706b749a8b1026f2a3338`.
  Apple may re-sign during upload; this is not a hash of the App Store download.
- Strict recursive code-signature validation passed. Signed entitlements include
  production APNs, `get-task-allow=false`, team `F3HRL896HJ`, the original
  application identifier and `group.inmerzion.statusline`.
- Firebase client configuration matches the configured production project.
  Its client values and private build/signing material are not recorded here.
  Only the required Firebase Core/Messaging/Installations dependencies are linked;
  no Firebase Analytics or advertising SDK is linked.
- Packaged app and widget localization checks passed: 675 messages across
  English, Spanish and fallback, plus 16 language-resolution cases.
- Previous isolated simulator QA passed both localized Swift suites (113
  invocations each) and two native EN/ES UI cases, including Claude focus and
  period selection. Widget renders were inspected. These checks do not establish
  fresh physical-device push delivery.

## Upload and App Store submission

- Xcode confirms **Uploaded statusline / EXPORT SUCCEEDED** at **08:27:40
  Europe/Madrid**. The package completed processing before selection.
- Selected the processed **1.1.4 (13)** build, ID
  `74f2bf85-c670-418d-9a0c-1e2d6d48b6bf`, not an older TestFlight binary.
- Saved complete English and Spanish descriptions, promotional text, keywords,
  subtitles and release notes. Names remain `Statusline: Agent Quota` in English
  and `Statusline` in Spanish. Support/marketing URLs remain on the official site.
- Updated App Review instructions describe all three services, the account-free
  local demo, optional pairing, notification registration, Firebase/APNs and
  best-effort delivery. The older physical recording is explicitly historical,
  not a new recording of Claude or notifications.
- Retained five existing localized Still Focus screenshots per language:
  quota, Antigravity, pairing, widget and privacy. Smaller supported iPhones
  inherit the matching-language set. No new screenshots were created or uploaded.
- Confirmed automatic release after approval and immediate availability to all
  eligible users. Pricing, review contacts, account-free access and availability
  settings were not changed.
- App Review confirms **Waiting for Review**, **1.1.4 (13)**, submitted on
  **13 October 2026 at 15:01 Europe/Madrid**, submission ID
  `63e84e07-7d21-47ad-9fa8-4da9ed8127a9`.
- **1.1.3** remains the observed Ready for Distribution version. Submission is
  not approval or public availability of 1.1.4.

## Limits and follow-up

No phone was installed, unpaired or had notification preferences changed during
this delivery. Fresh physical permission/registration and production push tests
of build 13 remain follow-up QA, not a claimed result. Existing store captures
remain valid service-subset examples but do not advertise Claude visually.
