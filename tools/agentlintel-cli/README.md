# @agentlintel/cli

AI coding agents forget architecture. AgentLintel makes your repo architecture
enforceable in CI.

Use it when agents keep inventing new folders, imports, layers, or error
patterns; when you are tired of repeating the same architecture instructions;
or when you want pull requests to fail on repo-convention drift.

AgentLintel is local-first: verified facts, deterministic rules with fixtures,
guard zones, exemplars, standard Agent Skills, and append-only decisions. No
model calls, no hosted service, no telemetry.

Fixture-backed starter checks catch drift like deep imports, raw request casts
before validation, and secret logging. Use `engine: external` for deeper checks
from tools your stack already trusts.

## Install

Pinned GitHub Release tarball:

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.11/agentlintel-cli.tgz
```

Registry install, when npm shows the same version as the GitHub release:

```bash
npm i -D @agentlintel/cli
```

For prereleases, the GitHub Release tarball is the canonical exact-version
install path when the registry trails the latest release.

## Quick Start

```bash
npx agentlintel init
npx agentlintel verify
npx agentlintel report
npx agentlintel explain --path src/example.ts
```

Architecture packs:

```bash
npx agentlintel init --pattern vertical-slice
npx agentlintel init --pattern layered-3tier
npx agentlintel init --pattern mvvm
npx agentlintel init --pattern custom
```

Optional adopter glue:

```bash
npx agentlintel init --adapters --hooks --engine-adapters
```

Patterns are starters. Custom architecture, commit, and PR policies live in
`.agentlintel/rules.yaml`; use `engine: external` for native checkers instead
of stretching regex into semantic analysis.

## CI

```yaml
- uses: actions/checkout@v4
- uses: lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2
  with:
    strict: "true"
```

CI should run the strict gate on every pull request.

## Commands

```text
agentlintel init      scaffold .agentlintel/ kernel + AGENTS.md
agentlintel verify    facts fresh + rules pass + fixtures green + guard held
agentlintel report    the same gate as markdown (--json for machines)
agentlintel explain   show which contract parts apply to a path
```

Common flags: `--dir <root>`, `--json`, `--strict`, `--no-run`,
`--skip-fixtures`, `--diff`, `--quiet`, `--bail`, `--workspace`,
`--mode warn`.

Explain flag: `--path <file>`.

Init extras: `--pattern`, `--from-v1`, `--adapters`, `--hooks`,
`--engine-adapters`, `--force`.

Exit codes: `0` gate passed, `1` gate failed, `2` internal/config error.

Plain Node >= 18, one dependency (`yaml`), no build step.
Full spec and file formats: https://github.com/lishan-fernando/AGENTLINTEL.

## License

Source-available free use. The CLI is under the AgentLintel Free Use No-Resale
License 1.0 (see `LICENSE`): free for personal, internal, commercial, and
non-commercial projects, including client projects, but you may not sell
AgentLintel itself, a fork, or a rebranded substantially similar
architecture-gate system. Using AgentLintel does not change the license of your
source code, product, repository, project-authored ADRs, application-generated
files, reports, or output. AgentLintel-supplied starter templates copied by
`init` are Apache-2.0 (see `LICENSE-APACHE`), with normal Apache notice/license
preservation for the copied template content.
