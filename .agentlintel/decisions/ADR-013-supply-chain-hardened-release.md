# ADR-013: Supply-Chain-Hardened Release Pipeline

Accepted: 2026-07-04

Before release, the CI/CD surface graduates from "works" to
"defensible". A framework whose pitch is *deterministic enforcement* cannot
ship through a pipeline built on floating tags, untested support claims, and
inferred publish intent. The same standard the gate applies to adopter repos
now applies to how AgentLintel itself is built and released.

Decisions, each machine-enforced by `test/release-surfaces.test.js` so a PR
cannot quietly regress them:

- **Test the claims, not the happy path.** `engines` says Node >= 18 and the
  CLI is developed on Windows, yet CI ran only Node 22 on Linux. The suite
  now runs on ubuntu/windows/macos × Node 18/22/24 — the floor and every
  current LTS line on every OS adopters use. A support claim CI does not
  execute is a wish, not a fact.
- **One required check: `ci-ok`.** Branch protection targets a single
  aggregation job that requires every matrix cell and the self-hosted gate.
  Adding a matrix cell never silently widens the set of checks an admin must
  reconfigure.
- **Pin actions to commit SHAs.** Third-party workflow actions are the one
  place this repo executes code it does not review per-release. Every
  `uses:` pins a 40-char commit SHA; Dependabot (grouped, weekly) proposes
  bumps and the merge gate judges them. A floating tag fails the suite.
- **Install from a committed lockfile.** The CLI has exactly one runtime
  dependency, but the release job runs whatever the registry serves at pack
  time. `tools/agentlintel-cli/package-lock.json` is committed and CI/release
  installs use `npm ci`, so a compromised upstream release cannot enter the
  pipeline unreviewed. Adopters still resolve `^` ranges; the lockfile
  protects this repo's build environment, not their installs.
- **Publishing is a decision, not an inference.** The old workflow published
  to npm when an `NPM_TOKEN` secret happened to exist — silent behavior
  change by side effect, and unworkable once tokenless OIDC removes the
  secret entirely. The release publishes if and only if the repository
  variable `NPM_PUBLISH` is `"true"`; anything else skips with a notice.
- **Provenance on every registry publish.** `npm publish --access public
  --provenance` with `id-token: write`, so every npm version carries a
  Sigstore attestation binding it to this repo, this workflow, this commit.
  Auth bootstraps with a short-lived granular token for the first publish,
  then moves to npm trusted publishing (GitHub OIDC) and classic tokens are
  disallowed on the package — no long-lived publish credential exists.
- **Checksummed release assets.** The stable-name tarball ships with a
  `sha256` file so the no-npm install path can be verified end to end.

Byte-budget consequence (ADR-011 discipline): the pipeline, runbook, and
Dependabot config add ~7.5K of eligible tracked bytes to a repo that sat at
164,140 of 165,000. The eligible budget recalibrates 165,000 → 174,000, and
`package-lock.json` joins the dead-weight exclusions — machine-generated
mirrors of `package.json` are not movable payload, the same reasoning that
excludes license texts (ADR-012).

Out of scope, deliberately: no release-prep automation (a two-file version
bump documented in `docs/PUBLISHING.md` does not justify workflow surface),
no custom CodeQL workflow (GitHub default setup covers a dependency-light
CommonJS CLI), and no signing beyond provenance until adopters ask for it.

Supersedes nothing; extends ADR-008 (tarball distribution) and rides the
posture of ADR-012 (the pipeline files stay Apache-2.0 adoption surface).

Amendment (2026-07-04, same day): the `NPM_PUBLISH` variable and `NPM_TOKEN`
secret live on the `NPM` deployment environment rather than the repository —
the release job declares `environment: NPM`, and the environment restricts
deployments to `v*` tags, so publish credentials are unreachable from any
other workflow or ref. The decision itself is unchanged: publishing remains
an explicit variable flip, and trusted publishing binds to that environment.
