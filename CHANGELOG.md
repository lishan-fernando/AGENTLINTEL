# Changelog

## Unreleased

## v2.0.0-alpha.14 - 2026-08-09

- Adds Git-derived `enforcement: no-new` for brownfield built-in rules: legacy
  findings stay visible, introduced findings fail, resolved debt is counted,
  duplicate findings cannot hide behind one baseline occurrence, and Git
  renames preserve identity without a stored violation snapshot.
- Fails closed when a no-new baseline cannot be proven and ratchets changing an
  existing all-violations rule into the weaker brownfield mode.
- Extracts external-output adapters and pure rule-entry scanning from verifier
  orchestration, then freezes a lower per-file line budget.
- Machine-checks the CLI's no-build and single-runtime-dependency promises and
  consolidates YAGNI, reuse-first, native-first, and architecture-aware
  simplification as advice rather than unverifiable rules.
- Adds a fail-closed SARIF 2.1 external adapter that preserves native analyzer
  diagnostic IDs and exact repository-relative file, line, and column evidence.
- Ships an opt-in .NET compiler/analyzer starter, recorded conformance fixtures,
  and adoption guidance without introducing a C# parser or runtime dependency.
- Updates the repository and composite Action runtimes to the current pinned
  `actions/checkout` and `actions/setup-node` revisions.
- Isolates external-adapter test repositories from CI event base variables and
  normalizes real temporary-directory roots across macOS path aliases.

## v2.0.0-alpha.13 - 2026-07-15

Release pipeline repair.

- Removes the generated GitHub Release tarball and checksum from the checkout
  before npm's `prepublishOnly` lifecycle reruns the repository byte budgets.
- Adds a regression contract that keeps cleanup after release upload and before
  npm publication, preserving both the downloadable artifact and a clean gate.

## v2.0.0-alpha.12 - 2026-07-15

Release-candidate integrity and standards pass.

- Makes ADR history genuinely append-only and accepts only a newly added ADR
  as provenance for fact, exemplar, rule, or guard weakening.
- Requires every rule to prove passing and failing behavior with non-vacuous
  conformance fixtures; rejects malformed kernel IDs, no-op rules, empty
  guards, empty exemption metadata, and invalid expiry dates.
- Removes the ineffective before-write hook, makes the end-of-turn hook fail
  closed, eliminates hidden Git fetches, and hardens composite-action inputs.
- Requires a real target base and tracked governance for strict Git gates;
  rejects nested pseudo-roots, incomplete strict scans, sparse/hidden index
  state, and opaque governed symlink or gitlink boundaries.
- Fails closed on oversized scan inputs, aliased governance YAML, malformed
  external output, or unsupported native-language `layers` input instead of
  treating unexamined evidence as clean.
- Runs command facts and external engines only against a committed Git
  snapshot and fails if they mutate versionable evidence during the gate.
- Moves skills to the cross-client `.agents/skills/` convention and uses
  Claude Code's literal `@AGENTS.md` import.
- Adds a base-branch CODEOWNERS boundary around the contract and verifier.
- Pins copyable Action examples to `v2.0.0-alpha.12`, derives exact event base
  SHAs, and keeps fork PR and merge-group command execution untrusted by
  default.
- Adds positive cross-file architecture evidence with conditional activation,
  while preserving the matched eShop benchmark's negative result: the gate
  improved frozen-contract compliance but did not meet the preregistered
  architecture-quality threshold.
- Binds exemptions and every ratchet weakening to exact append-only ADR
  authorization; protects registered exemplar implementations and declared
  external-checker evidence; and prevents deletion of a baseline trigger from
  silently deactivating a positive rule.
- Adds the `scope-change` and `prove-stateful-workflow` Agent Skills plus a
  shape-aware compact context frontier. The release enforces at least 50
  percent reduction under its versionable-byte token proxy and records the
  latest measured result without claiming equivalent model-token savings.

Alpha upgrade: delete `.agentlintel/hooks/pretooluse-hook.sh` and its Claude
`PreToolUse` registration. Move any project skills to `.agents/skills/`, then
delete the legacy `.agentlintel/skills/` directory. The gate now reports both
retired paths so stale duplicate behavior cannot hide.

## v2.0.0-alpha.11 - 2026-07-07

Legal clarity pass.

- Supersedes the FSL fair-source posture for future releases with the
  AgentLintel Free Use No-Resale License 1.0: AgentLintel is free to use in
  commercial and non-commercial projects, project outputs stay with the user,
  and AgentLintel itself, forks, or rebranded substantially similar systems may
  not be sold.
- Keeps AgentLintel-supplied templates, generated starter files, and
  adopter-facing glue under Apache-2.0, while clarifying that adopter-authored
  `.agentlintel/` files do not become Apache-2.0 merely because of their path.
- Documents that previously published copies keep the license grants they were
  already published under.
- Makes npm the primary adopter install path in public docs:
  `npm i -D @agentlintel/cli@alpha`, with the GitHub Release tarball retained
  as the exact-version and registry-free fallback.

## v2.0.0-alpha.10 — 2026-07-06

CI/CD and npm release cleanup.

- CI now delegates repeated lifecycle work to package-owned npm scripts
  (`test:ci`, `release:check`), so local checks, repository CI, and release
  checks share the same contract.
- Repository and release workflows use the npm cache keyed by the committed
  CLI lockfile while keeping SHA-pinned actions, least-privilege tokens, the
  `ci-ok` aggregate, and strict release verification.
- `prepublishOnly` now runs the release check before any manual npm publish,
  preserving the same parse, test, strict gate, and package-shape smoke checks
  outside GitHub Actions.

## v2.0.0-alpha.9 — 2026-07-06

Repository hygiene and reliability pass.

- Malformed rule configuration now reports normal `RULE-CONFIG` gate failures
  instead of aborting verification; valid rules still run.
- `severity: warning` now behaves like `warn`, so warning rules are
  non-blocking outside `--strict`.
- Living docs and CLI tests use stable semantic filenames; date/version names
  stay in changelog entries, tags, release metadata, or append-only ADR
  history.
- The root package is now a script wrapper rather than an npm workspace root,
  preventing stray root `package-lock.json` churn. The committed CLI lockfile
  remains the build lockfile.
- Added machine-checked facts and release-surface tests for the hygiene rules,
  plus a command smoke pass across the public CLI surface.

## v2.0.0-alpha.8 — 2026-07-06

Apply the reviewed memory-tool comparison without touching the enforcement kernel
(ADR-016). DX and adoption surface only; facts, rules, guard, exemplars,
skills, and decisions are unchanged.

- `agentlintel explain --path <file>` prints which rules, guard zones,
  exemplars, and decisions apply to a path, and why. Authoring/debugging
  help — not a new enforcement path.
- `verify --mode warn` downgrades every finding to non-failing for an
  adoption ramp on an existing repo, distinct from per-rule `severity: warn`.
  CI still gates with `--strict`.
- `init --hooks` also installs a Claude Code `PreToolUse` hook that blocks a
  violating Edit/Write/MultiEdit at the write seam, alongside the existing
  `Stop` hook. Both ship; adopters choose.
- Rules may carry optional `adr:` provenance, printed beside violations so a
  failure names the accepted decision that justifies it.

## v2.0.0-alpha.7 — 2026-07-04

The first npm release: `@agentlintel/cli` on the registry with provenance.

- Prereleases publish under their prerelease dist-tag (`alpha`), never
  `latest` — npm 11 enforces the explicit choice and the workflow derives it
  from the version.
- The CLI `bin` target dropped its `./` prefix: npm >= 11.17 treats the
  prefixed form as invalid and strips the entry at publish, which would have
  shipped a CLI that `npx agentlintel` cannot run. A release-surfaces test
  now fails on any `./`-prefixed bin.

## v2.0.0-alpha.6 — 2026-07-04

Supply-chain-hardened CI/CD before release (ADR-013).
GitHub Release only; its npm publish was blocked by the two defects fixed
in alpha.7.

- CI tests the support claims: ubuntu/windows/macos × Node 18/22/24 behind
  one `ci-ok` check; actions pinned to commit SHAs; installs from a
  committed lockfile; weekly grouped Dependabot — all machine-enforced by
  the release-surfaces tests.
- Releases publish `@agentlintel/cli` to npm with provenance, gated by the
  explicit `NPM_PUBLISH` variable (token bootstrap → tokenless trusted
  publishing; see `docs/PUBLISHING.md`). Tarballs ship `sha256` checksums.
- Publish credentials are scoped to the `NPM` deployment environment,
  restricted to `v*` tag runs (ADR-013 amendment).

## v2.0.0-alpha.5 — 2026-07-04

The fair-source release.

- Relicensed for the alpha.5 baseline (ADR-012). The core — CLI
  source, spec, docs — moves from Apache-2.0 to fair-source `FSL-1.1-ALv2`:
  free for any use except selling AgentLintel itself; each release converts
  to Apache-2.0 two years after publication. The adoption surface (templates,
  `.agentlintel/**` contract formats, CI glue) stays Apache-2.0, so nothing
  fair-source-licensed enters adopter repos. `docs/LEGAL.md` is the map;
  the posture is machine-enforced (license facts, claims tests, packaged
  `LICENSE`), and `CODE_OF_CONDUCT.md` lands alongside.
- Withdrawn: releases `v2.0.0-alpha.1`–`v2.0.0-alpha.4` and their tags
  (published under Apache-2.0; copies already obtained keep that license).
  Public history restarts at this baseline; the `v2` action tag follows it.
- README upgraded to decision-grade: problem statement, instruct-once vision,
  process diagrams, adopt/don't-adopt criteria (ADR-011). The tracked-byte
  budget is recalibrated 148K → 165K and stays machine-enforced.

## v2.0.0-alpha.4 — 2026-07-04

Closed the remaining adoption blockers.

- Engine-adapter templates ship recorded conformance snippets
  (`commit.message-format`, `pr.metadata-policy`) — the JSONL output-mapping
  contract is fixture-backed out of the box.
- `init` and `verify` hardening; facts, external-engine, and workspace test
  coverage extended.

## v2.0.0-alpha.3 — 2026-07-04

The repo dogfoods its own delivery surfaces.

- Installed here: the agent hook (`.agentlintel/hooks/verify-hook.sh`) and the
  Copilot instructions adapter
  (`.github/instructions/agentlintel.instructions.md`).
- Hook template simplified; release workflow and pre-commit metadata updated.

## v2.0.0-alpha.2 — 2026-07-04

Language-agnostic contracts and commit/PR policy support.

- `secrets.no-logging` now uses the CLI default text-extension scan — coverage
  extends to Rust, Kotlin, Swift, C/C++, Scala, and Elixir-style sources
  through one machine-tested extension list (ADR-010).
- New `engine: external` templates: commit-message policy and GitHub PR
  metadata policy, with matching rule snippets.
- SPEC and templates updated for language-agnostic contract surfaces; pattern
  packs tightened; governance and external-engine tests expanded.

## v2.0.0-alpha.1 — 2026-06-10

The lean restructure. Design rationale: `docs/DESIGN-RATIONALE.md`. One law
now governs the repo: **every artifact is machine-verified, append-only, or
deleted.**

### Added

- `facts.yaml` — machine-checked project facts (`path_exists`, `file_contains`,
  `command`). Stale facts fail the gate; this kills the
  metadata-says-MediatR-while-code-uses-Wolverine class of drift.
- `guard.json` — write-boundary zones checked against git diff (promoted from
  a pre-v2 deployment's `architecture.guard.json`).
- `exemplars.yaml` — exemplar registry with existence checks.
- Rewritten CLI (`@agentlintel/cli` 2.0.0-alpha.1): three commands
  (`init`, `verify`, `report`), modular source, 13 tests, one dependency.
- Three Agent Skills (standard SKILL.md): `strangler-extraction`,
  `mirror-exemplar`, `audit-architecture`.
- `SPEC.md` — the complete adopter-facing spec (≤ 500 lines).
- `boundary.validation` is now deterministically enforced (raw-cast heuristic)
  and fixture-backed; previously instruction-only.
- CI runs the gate against this repo itself (`verify --strict`).

### Removed (the diet)

- All compile targets (Cursor/Copilot×3/Codex/agents-md/skills) — AGENTS.md
  and SKILL.md are read natively by the tools that matter; nothing to compile.
- `index.yaml` router, `modes.yaml` — hosts do progressive disclosure via
  skills now.
- `context.yaml`, `manifest.yaml` + 670-line schema, `packs.yaml`,
  `features.yaml`, `orchestrator-policy.yaml`, `worker-registry.yaml`,
  `thinking-modes.yaml` and their schemas — hand-maintained code mirrors and
  executor-less orchestration metadata.
- The 5,133-line single-file CLI and its 14 commands.
- `AGENTLINTEL.md` (16K), `AGENTS-EXTENDED.md`, `AGENTLINTEL-CONTEXT.md`,
  twelve v1 docs, the metadata-only example packs, PowerShell smoke gates.
- 18 instruction-only "rules" — demoted to one-line principles in AGENTS.md.
  A rule is only a rule if a machine can fail a PR over it.

### Counts

- Concepts: ~40 → 6. Schemas: 10 → 0 (formats documented in SPEC.md).
- Rules: 27 declared / 7 enforced → 7 declared / 7 enforced.
- Always-load: ~21K tokens measured in a pre-v2 deployment → ≤ 2K target.

## v0.3.0 — 2026-05

Last v1 release. Superseded by the verified, append-only, or deleted model.

## v0.2.0

Historical public-preview release. Current implementation behavior lives in
`SPEC.md` and this changelog.
