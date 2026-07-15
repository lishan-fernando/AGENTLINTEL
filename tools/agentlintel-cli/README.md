# @agentlintel/cli

AI coding agents forget architecture. AgentLintel makes your repo architecture
enforceable in CI.

Use it when agents keep inventing new folders, imports, layers, or error
patterns; when you are tired of repeating the same architecture instructions;
or when you want pull requests to fail on repo-convention drift.

AgentLintel is local-first: verified facts, deterministic rules with fixtures,
guard zones, exemplars, standard Agent Skills, and append-only decisions. Its
built-ins make no model calls, network calls, or telemetry uploads; configured
command facts and external engines execute repository-declared tools.

Fixture-backed starter checks catch drift like deep imports, raw request casts
before validation, and likely secret-value logging. Use `engine: external` for
deeper checks from tools your stack already trusts. The built-in `layers`
engine checks JS/TS imports only; use a native external checker for other
languages.

## Install

Current alpha from npm:

```bash
npm i -D @agentlintel/cli@alpha
```

During prerelease, `@agentlintel/cli@alpha` is the current npm channel. The
unqualified `@agentlintel/cli` install follows npm's `latest` tag, which may
intentionally trail until a stable release.

Exact GitHub Release tarball, for pinned or registry-free installs:

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.13/agentlintel-cli.tgz
```

## Quick Start

```bash
npx agentlintel init
npx agentlintel verify
npx agentlintel report
npx agentlintel explain --path src/example.ts
```

`init` installs on-demand workflows under `.agents/skills/` and writes
`CLAUDE.md` as the one-line `@AGENTS.md` compatibility import.

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
  with:
    fetch-depth: 0
- uses: lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2.0.0-alpha.13
  with:
    strict: "true"
```

CI should check out full history and run the strict gate on every pull request.
The Action supplies the actual event base SHA. A direct CLI gate must run from
the repository top-level as
`agentlintel verify --strict --base <target-sha>`.

## Commands

```text
agentlintel init      scaffold the kernel, .agents/skills/, and AGENTS.md
agentlintel verify    facts fresh + rules pass + fixtures green + guard held
agentlintel report    the same gate as markdown (--json for machines)
agentlintel explain   show which contract parts apply to a path
```

Common flags: `--dir <root>`, `--json`, `--strict`, `--no-run`,
`--skip-fixtures`, `--diff`, `--quiet`, `--bail`, `--workspace`,
`--mode warn`.

Explain flags: `--path <file>`, optional `--shape <shape>`, and `--compact` for
the measured context frontier.

Init extras: `--pattern`, `--from-v1`, `--adapters`, `--hooks`,
`--engine-adapters`, `--force`.

Exit codes: `0` gate passed, `1` gate findings, `2` invalid invocation or
internal error.

`--diff`, `--skip-fixtures`, and `--no-run` are incomplete under `--strict`.
Ignored or untracked governance cannot establish a Git-backed strict verdict.
Command facts and external engines require a committed Git snapshot and may
not change versionable state during verification.

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
