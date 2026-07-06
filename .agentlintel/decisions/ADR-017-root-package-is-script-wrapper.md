# ADR-017: Root package is a script wrapper

Accepted: 2026-07-06

The repository has one publishable Node package: `tools/agentlintel-cli`.
CI, release, and the composite GitHub Action already install that package with
`npm ci --prefix tools/agentlintel-cli`, and ADR-013 made
`tools/agentlintel-cli/package-lock.json` the committed build lockfile.

Keeping a root npm `workspaces` declaration created a second, implicit install
surface. A contributor running the documented `cd tools/agentlintel-cli &&
npm install` command could generate an untracked root `package-lock.json`,
even though the root package only delegates scripts and is not published.
That made the clean working tree depend on local npm behavior rather than on
the repository contract.

Decision:

- The root `package.json` stays as metadata plus script delegation only.
- `tools/agentlintel-cli/package-lock.json` remains the only committed npm
  lockfile.
- Contributor docs use `npm ci --no-audit --no-fund` inside
  `tools/agentlintel-cli`, matching CI and release.
- `.agentlintel/facts.yaml` verifies that no root `package-lock.json` exists.

This supersedes the workspace part of ADR-005's distribution-infrastructure
plan. The GitHub Action, pre-commit hook, tarball release, and npm publish
paths remain unchanged.
