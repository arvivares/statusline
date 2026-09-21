# Node toolchain

Statusline uses **Node.js 26.9.0** and its bundled **npm 11.19.1** for development,
tests and artifact preparation. `.node-version` is the single CI version source;
every `actions/setup-node` step reads that file from the checked-out revision.
The four npm projects declare `>=26.9.0 <27`. The relay's `@types/node` targets
major 26; updating type declarations alone does not upgrade an executable runtime.

## Scope and support

Node 26 is a **Current**, not LTS, release at adoption on 21 September 2026.
This is an explicit build-toolchain choice, not a claim that Node 26 is LTS.
Cloudflare supports Current Node releases for Wrangler. Production Workers run
in `workerd`, not the locally installed Node executable. This change does not
modify Worker compatibility settings, API routes, D1 migrations, encryption,
pairing credentials or the installed mobile/desktop runtimes.

Node is used by Vite, TypeScript, Vitest, Wrangler, brand/localization generators
and release validation scripts. The website is deployed as static files; the
Companion and mobile apps do not gain a Node runtime requirement. Java, Rust,
Xcode and Android SDK versions are unchanged. GitHub Actions' own embedded Node
runtimes are owned by each action and are separate from `setup-node`.

## Validation

Before adopting another Node version:

1. Use an isolated installation; do not replace a developer's global Node.
   Verify downloaded binaries against the official SHA-256 manifest.
2. Run clean `npm ci` and audits in `apps/desktop`, `apps/web`, `branding` and
   `services/relay`, using their committed lockfiles.
3. Follow each component's documented tests and builds. Include the desktop
   release checks and frontend build; every website test and static build;
   deterministic brand exports, QR and store-artwork validators; and the Apple
   bundle, dependency-policy, website-CI and Node-toolchain guards.
4. Run relay tests, TypeScript, migrations against **local temporary storage**,
   a Wrangler `--dry-run` and a local HTTP smoke test. Compare emitted Worker
   JavaScript with the prior Node toolchain. Never point diagnostics at real
   paired channels or execute remote migrations to test Node compatibility.
5. Require successful CI, including companion tooling and relay tests/dry-runs
   on macOS, Windows and Linux, before merging. Native checks still run, but no
   installers are signed or published by this validation.

`node --test scripts/node-toolchain.test.mjs` checks version alignment between
the shared pin, manifests, lockfiles, relay declarations and workflow setup.
The final validation evidence is recorded on PR #65. A CI build is not physical
device QA and does not certify a new signed installer release.

### Local macOS checks

Run the native release guards with a full Xcode toolchain, not only the standalone
Command Line Tools. For a standard installation, select it for the current shell:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcrun --find lipo
```

Adapt the path if Xcode is installed elsewhere. This does not change the global
`xcode-select` setting. During Node 26 validation, the universal-binary fixture
passed with this explicit Xcode selection; the standalone Command Line Tools
selection rejected the same `lipo` invocation. Do not skip the architecture guard
or alter production packaging to make an environment mismatch pass.

## Rollout and rollback

Merging the reviewed migration adopts the toolchain for subsequent CI builds and
release preparation. Contributors and external build hosts must select the Node
version in `.node-version`; merging cannot upgrade their installed executable.
No new app version or store submission is required solely for this tool change.

A byte-identical Worker bundle requires no production relay redeployment or D1
migration. If a future tool update changes emitted code, review and test that
artifact before separately deploying it under the normal relay procedure.

To roll back, revert the migration as a reviewed PR, restoring the Node 24 pin,
matching type declarations, manifests/lockfiles and CI policy together. Do not
roll back user data or pairing credentials. Older release recovery workflows
read the `.node-version` belonging to the checked-out release revision.

References: [Node 26.9.0 release](https://nodejs.org/en/blog/release/v26.9.0),
[Node release status](https://nodejs.org/en/about/previous-releases) and
[Wrangler support and Workers runtime](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
