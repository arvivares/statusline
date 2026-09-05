# Statusline documentation

This directory contains durable technical and operational documentation. The root
[README](../README.md) is the product overview; component-specific instructions live next
to their source code.

Community, security and top-level product documentation is available in English. Some
implementation and release guides are currently maintained in Spanish; translation pull
requests are welcome.

## Product direction

- [Product and engineering roadmap](../ROADMAP.md): provider feasibility, multi-agent
  architecture, delivery sequence and feature backlog.

## Architecture and protocol

- [Cross-platform architecture](architecture/cross-platform-companion.md): component
  boundaries, data flow and platform coverage.
- [Application localization](architecture/localization.md): system-language policy,
  shared English/Spanish catalog, generated resources and validation.
- [Statusline Relay Protocol v1](../protocol/statusline-relay-v1.md): normative wire and
  credential contract.
- [AES-GCM fixture](../protocol/fixtures/aes-gcm-v1.json): shared interoperability vector.

## Relay operations

- [Universal setup](../SETUP.md): end-to-end local and production configuration.
- [Deployment options and capacity](relay/deployment-options.md): Cloudflare reference,
  usage calculations and the planned self-hosted adapter.
- [Relay service](../services/relay/README.md): local development and D1 deployment.

## Releases

- [Public release runbook](release/release-runbook.md): canonical version, unified tag,
  required assets, SignPath inputs, provenance and publication procedure.
- [Current beta release notes](release/notes/v0.1.11.md): curated user-facing notes and
  known limitations for the next candidate.
- [Desktop installers](release/desktop-installers.md): build matrix, signing, checksums and
  smoke tests.
- [Public repository launch](release/public-repository-checklist.md): source-history,
  account-security and GitHub visibility controls.
- [Public beta checklist](release/public-beta-checklist.md): evidence-based release gates.
- [Mobile store accounts](release/mobile-store-accounts.md): distribution decisions and
  current store requirements.
- [Apple submission kit](../apps/apple/store/README.md).
- [Google Play submission kit](../apps/android/store/README.md).

## Security and policy

- [Security policy](../SECURITY.md): private vulnerability reporting.
- [Privacy policy](../PRIVACY.md): data processing, retention and deletion.
- [Security review](security/security-review.md): resolved findings, accepted dependency
  exceptions and operational risks.
- [Code-signing policy](security/code-signing-policy.md): roles, trust boundaries and
  release controls.

## Design archive

The [design archive](archive/README.md) preserves historical prototypes that led to Data
Plane. It is reference material, not current product behavior or configuration.

## Component guides

- [Desktop companion](../apps/desktop/README.md)
- [Android](../apps/android/README.md)
- [Apple platforms](../apps/apple/README.md)
- [Relay](../services/relay/README.md)
