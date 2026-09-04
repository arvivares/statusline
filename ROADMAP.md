# Statusline roadmap

Statusline v1 is deliberately focused on Codex. The product direction is a private,
local-first command center for understanding capacity across coding agents without
opening each tool separately.

This roadmap communicates direction, not delivery dates. Items move only when their
data source is documented, privacy-preserving and reliable enough for a public product.

## Product north star

At a glance, Statusline should answer four questions for every connected agent:

1. How much capacity is available?
2. When does it reset or renew?
3. How fresh and trustworthy is the reading?
4. Which agent is currently available for the next task?

Different vendors expose different concepts. Statusline will preserve native units—such
as percentage, requests, tokens, credits or currency—instead of inventing a universal
percentage when one cannot be calculated honestly.

## Product principles

- **Local first.** Prefer documented local interfaces and keep collection on the user's
  computer.
- **Minimum necessary data.** Read usage metadata, never prompts, conversations or source
  code.
- **Capability-based adapters.** Each adapter declares whether it supports remaining
  capacity, limits, resets, cost, history and account scope.
- **Explicit authorization.** Use official APIs only with informed consent and the
  narrowest available permissions.
- **Zero-knowledge sync.** Secrets remain in operating-system secure storage and the
  relay receives only end-to-end encrypted snapshots.
- **Honest uncertainty.** Show unavailable, stale, estimated and partial data explicitly.
- **Graceful isolation.** One unavailable provider must not block collection or display
  for the others.

## Provider feasibility

| Provider                     | Supported source                                                                                                                                                                                  | Useful signals                                              | Direction                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Codex**                    | Local Codex App Server                                                                                                                                                                            | Short and weekly windows, remaining percentage, reset, plan | **Available in v1.** Extract the current implementation into the first provider adapter.   |
| **AGY / Google Antigravity** | Documented [`/usage`](https://www.agy.dev/docs/cli/commands/usage/) and [status line JSON](https://www.agy.dev/docs/cli/statusline/)                                                              | Per-model quota, remaining fraction, resets, context usage  | **Best next proof of concept.** Validate discovery and fixtures on every desktop platform. |
| **Claude Code**              | Structured [CLI output](https://docs.anthropic.com/en/docs/claude-code/cli-usage) and organization [Admin API](https://docs.anthropic.com/en/api/admin-api/usage-cost/get-messages-usage-report)  | Session usage; organization usage and cost                  | **Research.** Do not promise personal subscription remainder without a supported source.   |
| **GitHub Copilot**           | Official [Copilot usage metrics](https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics) and [REST API](https://docs.github.com/en/rest/copilot?apiVersion=2026-03-10) | Organization activity, adoption and premium-request usage   | **Research for team mode.** Current metrics are not a direct personal quota equivalent.    |

Gemini CLI, Cursor, Windsurf, OpenCode and Aider are candidates for later discovery.
They remain exploratory until a stable, permitted usage source is verified.

## Architecture required for multiple agents

Before adding a second production provider, Statusline will introduce a shared model:

- `AgentProvider`: identity, discovery, authorization and collection lifecycle.
- `AgentUsageSnapshot`: provider, account scope, sample time, health and metrics.
- `UsageMetric`: native unit, consumed/remaining/limit values, window and reset time.
- `ProviderCapabilities`: explicit support for quota, reset, cost, history and forecasts.
- `SourceHealth`: fresh, stale, unavailable, unauthorized or unsupported, with a safe
  diagnostic reason.

The desktop registry will run adapters independently and normalize only their structure,
not their meaning. Relay protocol v2 will carry an encrypted array of provider snapshots
while retaining a migration path for existing v1 Codex pairings. Mobile apps, caches and
widgets will consume the same shared contract.

## Delivery sequence

### Now — ship the Codex foundation

- Complete public repository and Windows signing onboarding.
- Finish the first App Store and Google Play release gates.
- Keep installer, protocol, encryption and physical-device tests green.
- Establish a privacy and reliability baseline before widening collection scope.

### Next — create the multi-agent core

- Write the provider contract and protocol v2 as versioned specifications.
- Refactor Codex into the reference adapter without changing v1 behavior.
- Add cross-platform fixtures and contract tests for adapter discovery and normalization.
- Prototype the multi-provider Data Plane on desktop, iPhone, Android and widgets.
- Migrate encrypted sync with backward-compatible pairing and cache handling.

### Then — add providers deliberately

1. Build an AGY discovery spike and validate its documented status-line payload.
2. Promote AGY only after Windows, Linux and macOS fixtures pass.
3. Validate what Claude Code can expose for personal and organization accounts without
   scraping private credentials or undocumented account endpoints.
4. Prototype GitHub Copilot as an opt-in organization integration using official scopes.
5. Publish an adapter SDK only after at least three providers prove the abstraction.

### Later — expand the ecosystem

- Self-hosted Linux relay package and container image.
- Community adapters with capability manifests and conformance tests.
- Team and organization views backed only by supported admin APIs.
- Additional mobile, wearable and operating-system surfaces where they add real value.

## Feature backlog

### Unified command center

- One capacity board with provider order, visibility and account-scope controls.
- Compact overview showing remaining capacity, next reset and freshness for each agent.
- Reset timeline across all connected providers.
- “Available now” suggestion based on capacity and freshness, never an unsupported claim
  about model quality.
- Provider-specific detail that preserves native windows, models and units.
- Menu-bar and system-tray quick view without opening the full companion.

### Widgets and mobile surfaces

- Configurable single-provider and multi-provider widgets.
- A compact top-three capacity widget and a wider reset-timeline widget.
- Per-widget provider ordering and privacy mode for screenshots or shared screens.
- iOS Shortcuts and Android Quick Settings actions for refresh and status.
- Accessibility-first layouts, Dynamic Type and additional localizations.

### Alerts and useful intelligence

- Local notifications for low capacity, completed resets and stale sources.
- Adaptive refresh around reset times to reduce relay traffic and battery use.
- Local usage history with daily and weekly trends.
- Exhaustion forecast with an explicit confidence range when enough history exists.
- Cost and credit budgets only for providers that expose authoritative values.
- Optional provider-service incident indicators kept separate from personal quota.

### Privacy, control and reliability

- Per-provider collection and mobile-sync switches.
- Configurable local history retention and one-action deletion.
- Encrypted export/import for device migration.
- Redacted diagnostic bundle that excludes credentials, paths and pairing material.
- Offline and stale-state behavior with last-successful-sample context.
- Push-assisted mobile refresh without placing plaintext metadata in notifications.
- Desktop auto-update with signed release verification and safe rollback.

### Teams, after the personal product is mature

- Organization capacity overview using official admin APIs and explicit administrator
  consent.
- Role-based visibility and aggregate-only views where individual detail is unnecessary.
- Shared budget thresholds and exportable reports with clear source provenance.

## Definition of done for a provider adapter

A provider integration is production-ready only when:

- it uses a documented local interface or official API;
- it never extracts vendor session secrets for relay access;
- every metric identifies its unit, scope, source and freshness;
- unavailable or malformed data degrades safely without affecting other providers;
- fixture and contract tests pass on Windows, Linux and macOS;
- encrypted sync remains opaque to the relay;
- mobile and widget presentation is accessible and does not imply false precision;
- privacy, setup and troubleshooting documentation is complete.

## Deliberately out of scope

- Collecting prompts, conversations, generated content or source code.
- Storing vendor passwords, API keys or session credentials in the relay.
- Scraping undocumented account pages to manufacture quota values.
- Automatically purchasing credits or changing subscriptions.
- Remotely executing or orchestrating coding agents. Statusline is an observability
  product, not another agent runner.

## Contributing to the roadmap

Provider proposals should include the supported data source, required permissions,
available units, reset semantics, platform coverage and a sanitized fixture. Open a
[feature request](https://github.com/arvivares/statusline/issues/new?template=feature-request.yml)
before implementing a new adapter so the privacy and protocol impact can be reviewed.

Product names and trademarks belong to their respective owners. Listing a provider here
expresses interoperability interest and does not imply affiliation, endorsement or a
delivery commitment.
