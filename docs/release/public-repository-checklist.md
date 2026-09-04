# Public repository launch checklist

This is the operational gate for changing `arvivares/statusline` from private to public.
It complements the product-focused [public beta checklist](public-beta-checklist.md); it
does not authorize a store release or publish unsigned desktop installers.

**Last reviewed:** 4 September 2026

## Before changing visibility

- [x] Publish MIT license, contribution guide, code of conduct, support policy, privacy
      policy, security policy and private vulnerability-reporting instructions.
- [x] Document the architecture, relay protocol, deployment model, release process,
      signing policy, known limitations and product roadmap.
- [x] Keep example environment files secret-free and ignore local environments,
      certificates, keystores, provisioning profiles, build outputs and provider state.
- [x] Scan the complete source history with Gitleaks and manually review every match from
      archived GitHub Actions logs.
- [x] Audit desktop and relay npm dependencies with zero known vulnerabilities.
- [x] Pin every third-party GitHub Action to a full commit SHA.
- [x] Make workflow permissions read-only by default, prevent checkout credential
      persistence and scope write permission to release-asset jobs.
- [x] Assign repository ownership through `.github/CODEOWNERS`.
- [x] Register the maintainer's existing SSH public key as a GitHub signing key.
- [x] Validate the publication tree with the repository-quality and Android pipelines.
- [x] Enable two-factor authentication for `@arvivares`, store recovery codes offline,
      add a second recovery method and review active sessions.
- [x] Replace the visible branch history with one signed root commit, remove staging
      branches and remove tags that reference the private development history.
- [x] Verify the final root commit locally and as **Verified** on GitHub.
- [x] Confirm `main` is the only branch, there are no tags or releases, and the working
      tree matches the committed root tree.

## Visibility cutover

Perform these steps in one maintenance window. Keep the repository private if any
pre-public item above is incomplete.

- [x] Change repository visibility from **Private** to **Public**.
- [x] Enable the dependency graph, Dependabot alerts and Dependabot security updates.
- [x] Enable secret scanning and push protection; record that validity checks and
      non-provider patterns are unavailable on the current plan.
- [x] Enable private vulnerability reporting.
- [x] Triage every Dependabot finding; document accepted exceptions with reachability,
      owner, review date and exit criteria so no unexplained alert remains open.
- [x] Protect `main` with a repository ruleset that blocks deletions and force pushes,
      requires signed commits and linear history, resolves review conversations and requires
      the repository-quality and Android validation checks.
- [x] Confirm Actions has read-only default `GITHUB_TOKEN` permissions and cannot approve
      pull requests.
- [x] Verify the anonymous repository view, README images, Mermaid diagram, license,
      security-policy link, issue forms, clone URL and workflow badges in a signed-out window.

## First public release

- [x] Define `release.json`, the single signed `v<version>` tag and a fail-closed workflow
      that combines the enabled Desktop platforms and Android in one prerelease.
- [x] Replace the legacy Windows PFX path with a two-stage SignPath integration that has
      no unsigned fallback.
- [ ] Complete SignPath Foundation onboarding before representing Windows artifacts as
      signed public releases.
- [ ] Publish signed Linux, notarized macOS and signed Android artifacts from the
      `v0.1.10` tag; independently verify signatures, checksums and provenance.
- [ ] After SignPath approval, configure its real identifiers/token and enable Windows in
      a new version only after NSIS/MSI Authenticode and clean-machine validation pass.
- [ ] Publish a concise security and privacy summary with the announcement; never include
      QR links, tokens, account identifiers or diagnostic logs containing user paths.

## History and GitHub metadata

Rewriting `main` and deleting branches and tags leaves one source commit in the normal
repository history. Existing closed pull requests and historical Actions runs are
GitHub-hosted metadata and are not removed by a force push. They were included in the
credential audit. Creating a new repository is required only if removal of that metadata
is an absolute launch requirement.
