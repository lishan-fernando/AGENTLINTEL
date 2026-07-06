# ADR-019: CI npm script release contract

Accepted: 2026-07-06

ADR-013 hardened the release pipeline, but the workflow YAML still repeated
the npm lifecycle details directly: parse check, test suite, strict self-gate,
and package dry-run. That made GitHub Actions the source of truth for release
intent while local contributors and manual npm publishers had to remember the
same sequence from documentation.

Decision:

- The publishable package owns the lifecycle scripts:
  `test:ci`, `verify:strict`, `pack:dry-run`, and `release:check`.
- Repository CI calls `npm run test:ci` after installing from the committed
  CLI lockfile; release calls `npm run release:check`.
- `prepublishOnly` runs `release:check`, so a manual `npm publish` gets the
  same parse, test, strict gate, and package-shape checks as GitHub Actions.
- Repository and release workflows use the setup-node npm cache keyed to
  `tools/agentlintel-cli/package-lock.json`.

Unchanged from ADR-013: actions stay pinned to commit SHAs, installs use
`npm ci`, the matrix still tests ubuntu/windows/macos across Node 18/22/24,
branch protection still targets `ci-ok`, npm publishing is still controlled by
the explicit `NPM_PUBLISH` environment variable, and published packages still
carry provenance.

This is a simplification, not release-prep automation. Version bumps, changelog
entries, tags, and the moving `v2` action tag remain human-initiated release
steps documented in `docs/PUBLISHING.md`.

Machine enforcement:

- `test/release-surfaces.test.js` checks that workflows use the package-owned
  scripts and cache from the committed lockfile.
- The same test checks that `release:check` still includes parse checks, tests,
  strict verification, package dry-run, and `prepublishOnly`.

Budget consequence: CI script consolidation, cache wiring, release notes, and
this ADR move the total tracked-byte budget from 402,000 to 407,000. The
eligible movable-payload budget is unchanged because ADRs are excluded from
that measure and the non-ADR changes stay within the existing cap.
