# Claude Code mobile integration plan

Status: implementation on `feat/mobile-claude-notifications`, based on main
`ce78634a5aa834176040c3b46df829d625374187`, 13 October 2026.
Local QA builds are not store submissions. See the
[validation record](../validation/mobile-claude-notifications.md).

## Current boundary

Companion already discovers Claude Code and publishes live quota through its
documented status-line bridge. `claude_quota_projection` emits provider ID
`claude`, optional five-hour and weekly windows, and the original sample time.
Enterprise can report only five hours. Gateway spend limits are not quota windows.
See [the source and plan coverage](claude-sources.md).

The distributed mobile decoders recognize only `codex` and `antigravity`.
This branch adds `claude` to both apps and widgets. Unknown future IDs remain
ignored. Only the authoritative paired Companion inventory determines visibility.

## Delivery sequence

1. Add `claude` to Swift's shared `AgentProviderID` and Kotlin's
   `AgentProviderId`; display **Anthropic · Claude Code**. Audit every exhaustive
   provider switch, accessibility label, widget label and localized string.
2. Accept only valid `ready` readings with at least one reported window and
   `unavailable` readings with none. Validate Claude's five-hour window as 300
   minutes and weekly as 10,080, with bounded percentages/timestamps. Prefer five
   hours with a weekly fallback; do not infer absent weekly quota as 100% or 0%.
3. Show Claude only when included in the paired Companion's authoritative
   inventory. Preserve disabled-service preferences, removal, focus fallback,
   cached/offline age and channel-scoped sequence protection. No global service
   catalog, mobile discovery, credential extraction or extra quota API request.
4. Preserve Still Signature/Still Focus. Verify focus plus two watchlist rows in
   both apps and all supported widgets; adjust only the three-provider compact
   layout if it clips. Keep segmented meters, the white final segment, percentage
   spacing, tap targets and company/tool identities consistent in EN/ES.
5. Add shared synthetic three-provider, Claude-only, short-only, unavailable and
   removal fixtures. Test malformed known providers, unknown future providers,
   sample age, focus persistence, offline fallback, replay/cross-channel rejection,
   legacy Codex compatibility and disconnect/re-pair cache isolation.
6. Run Swift unit/widget tests, Android unit/lint/release checks, localization and
   existing relay interoperability tests before capture/store metadata. Update
   the older Claude foundation wording in the protocol documentation without
   changing the normative wire contract.
7. Capture native five-image EN/ES store sets only after the actual new mobile UI
   passes its layout checks. Update store copy to advertise all three providers
   only for the binaries that recognize them. Use TestFlight/closed testing for
   the new runtime delta before a later production submission; do not replace
   the already submitted 1.1.3 (12) silently.

## Compatibility and security invariants

Keep `schemaVersion: 1`, `payloadKind: services-v1`, authenticated-data format,
AES key, role-separated credentials and existing pairing unchanged. The opaque
relay already carries `claude`; no database migration or relay deployment is
needed. Older mobiles continue ignoring unknown providers. Preserve the 4 KiB
plaintext and 16-provider bounds and Codex-only reset-credit summaries.

Claude credentials, transcripts, prompts and workspace paths never reach mobile.
Quota samples remain encrypted end to end. Push metadata is a separate optional
feature with its existing minimum disclosure; adding a visible provider must not
automatically enable notifications or create another FCM subscription.

## Version and validation gates

The reviewed source candidate prepares Companion/Android **0.1.39**, Android code
**37**, and iOS **1.1.4 (13)** without retagging or replacing v0.1.38. Source
metadata is not a store submission or evidence of public availability. The
[release notes](../release/notes/v0.1.39.md) separate GitHub installers from
the manual iOS and Google Play delivery gates.

The API-24 compatibility hotfix already uses Android code 36 and keeps Play
automatic protection; allocate code 37 or higher for the next store binary.
Run lightweight checks before compilation and reuse dependency caches. A store
archive, physical-device push validation and new native store captures remain
separate release gates; never reuse or replace the published build 12.
