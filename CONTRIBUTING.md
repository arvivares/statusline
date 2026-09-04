# Contributing to Statusline

Thank you for helping improve Statusline. Contributions of code, tests,
documentation, translations and reproducible bug reports are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening an issue

- Search existing issues to avoid duplicates.
- Use the bug template for reproducible product defects and the feature template for
  scoped proposals.
- Use [SUPPORT.md](SUPPORT.md) for installation and pairing troubleshooting.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Never post API keys, access tokens, pairing links, QR codes, signing material or
  private Codex configuration.

## Development setup

The repository is a multi-platform monorepo. Start with the
[documentation index](docs/README.md) and [universal setup guide](SETUP.md), then use the
component-specific commands below.

| Component     | Validation command                                                                     |
| ------------- | -------------------------------------------------------------------------------------- |
| Desktop       | `cd apps/desktop && npm ci && npm run release:check`                                   |
| Relay         | `cd services/relay && npm ci && npm run db:migrate:local && npm test && npm run check` |
| Android       | `cd apps/android && ./gradlew testDebugUnitTest lintDebug assembleDebug`               |
| Apple         | Open `apps/apple/statusline.xcodeproj` and run the relevant Xcode test scheme          |
| Documentation | `node scripts/check-markdown-links.mjs`                                                |

Node, Java and Rust versions are pinned at the repository root. Platform-specific native
requirements are documented in each application directory.

## Making a change

1. Fork the repository and create a focused branch from `main`.
2. Keep the change small enough to review and avoid unrelated formatting rewrites.
3. Add or update tests for behavior changes.
4. Update protocol and user documentation when public behavior changes.
5. Run the checks for every affected component.
6. Open a pull request using the repository template.

Commit subjects follow the existing Conventional Commits style, for example:

```text
fix(desktop): detect standalone Codex on Windows
feat(android): add compact widget state
docs: explain self-hosted relay limits
```

## Pull request expectations

A pull request should:

- explain the user-visible problem and the chosen solution;
- identify affected platforms and test environments;
- include screenshots or recordings for interface changes;
- preserve end-to-end encryption and least-privilege credential boundaries;
- keep generated artifacts, local configuration and secrets out of Git;
- pass required GitHub Actions checks.

Maintainers may ask for changes when a contribution expands data collection, changes the
relay contract, introduces a network dependency or affects package signing.

## Protocol changes

`protocol/statusline-relay-v1.md` is normative. A breaking wire-format or credential-flow
change requires a new protocol version, interoperability fixtures and compatible updates
for Rust, Swift and Kotlin. Do not silently reinterpret an existing protocol field.

## Dependencies

Prefer actively maintained dependencies with clear open-source licenses. Explain why a
new runtime dependency is required, especially when it processes user data, performs
telemetry or increases installer size. Store and privacy declarations must be revalidated
when a mobile SDK changes its data behavior.

## Release and signing boundaries

External pull requests never receive signing secrets and cannot approve a release-signing
request. Public releases are produced only from reviewed commits through the documented
[code-signing policy](docs/security/code-signing-policy.md). Maintainers manually approve
SignPath requests and verify all final artifacts independently.

## License

By submitting a contribution, you agree that it may be distributed under the repository's
[MIT License](LICENSE).
