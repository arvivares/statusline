# Android 0.1.15 — Play submission evidence

Recorded on 10 September 2026 from the official release artifact, repository
source and the authenticated Google Play Console UI. Console states below are
point-in-time observations, not a guarantee of current availability.

## Artifact and scope

| Field | Verified value |
| --- | --- |
| Application ID | `inmerzion.statusline` |
| Version name / code | `0.1.15` / `11` |
| Artifact | `Statusline_0.1.15_android.aab` |
| Size | 14,939,446 bytes |
| SHA-256 | `0ef88df27d48883379ca44957beafec140fdff90f78d497d160a86d2565cf1de` |
| Release | [v0.1.15](https://github.com/arvivares/statusline/releases/tag/v0.1.15) |
| Source commit | `062f621440751503fa1235607ef1cb850822a330` |
| Build workflow | [34460364954, attempt 1](https://github.com/arvivares/statusline/actions/runs/34460364954) |
| Play release name | `0.1.15-alpha.1` |
| Track / rollout | Closed testing — Alpha / 100% of eligible testers |

- Reused the published AAB; no local compilation or re-signing was performed.
- Local SHA-256 and size matched `SHA256SUMS.txt` and `RELEASE-MANIFEST.json`.
- `gh attestation verify` succeeded for the AAB and `arvivares/statusline`.
- The checksum file's detached OpenPGP signature verified against the repository's
  pinned release key, fingerprint `7076AFAF1090C3709D1F080C5D779E12FC1130DB`.
- Google Play accepted the upload as `11 (0.1.15)`, API 23+, target SDK 36, with
  its ReTrace mapping file attached. No blocking validation error was shown.

Compared with the previous Alpha bundle, `0.1.12 (8)`, Android now opens privacy
and support on the official website in the device's supported language instead
of using the configured relay's public pages. The dependency declarations and
Android manifest are unchanged. Shared localization output was also updated.
The Android widget refresh schedule is unchanged; the desktop background-update
improvements require Companion 0.1.15 and must not be advertised as a guaranteed
five-minute Android widget refresh.

## Play Console verification

- Before this upload, Alpha `0.1.12-alpha.1` was available to selected testers and
  Publishing overview showed no unpublished changes.
- The new release includes bundle 11 and supersedes bundle 8. Play's compatibility
  comparison showed **zero devices newly supported or no longer supported** in
  every listed form factor, including 13,333 phones and 6,841 tablets.
- Exactly one non-blocking warning remained: native debug symbols are missing.
  The Java/Kotlin ReTrace mapping attachment does not resolve that native warning.
- Release notes were entered for `en-US` and `es-ES`, within the 500-character
  per-language limit (369 and 411 characters respectively).
- Only **one** change appeared in Publishing overview:
  **Closed testing — Alpha / 0.1.15-alpha.1 / Start full rollout**.
- After confirming **Send changes for review**, the console showed
  **Changes in review**. Initial automated checks were still running; Google
  stated that the change would proceed to review after those checks succeed.
- The existing 177-country targeting, selected tester lists and managed-publishing
  setting (off) were preserved. Production, internal testing, listing images,
  account membership and policy declarations were not changed by this submission.

## Remaining gates

- Wait for Google checks and review to complete, then confirm the release is
  available on Alpha before asking testers to update.
- On a real device enrolled in Alpha, update through Google Play and verify
  pairing survives, quota data still syncs, both languages work, the public
  privacy/support links open correctly and the widget remains functional.
  These physical-device update checks were not performed during submission.
- Do not install the GitHub APK over a Play-installed build as a substitute for
  testing the Play update path: the distributed signing certificates can differ.
- Investigate native debug-symbol availability before production for better
  crash and ANR diagnostics. Do not claim the warning is fixed.
- The listing screenshots and live policy URL fields were not refreshed or
  re-audited in this bundle-only submission. Recheck them before production;
  repository policy documents use the official website URLs.
