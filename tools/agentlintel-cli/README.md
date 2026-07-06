# @agentlintel/cli

Deterministic architecture gate for AI-agent codebases.

Spec-driven tools gate your workflow. AgentLintel gates your architecture:
verified facts, deterministic rules, conformance fixtures, guard zones,
exemplars, skills, and append-only decisions.

The verdict is deterministic; detection depth comes from the engine you choose.
Use built-in rules as portable starter checks and `engine: external` for
semantic or stack-native analyzers.

## Install

Pinned GitHub Release tarball:

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.9/agentlintel-cli.tgz
```

Registry install, once npm publishing is configured:

```bash
npm i -D @agentlintel/cli
```

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

Fair source. The CLI is `FSL-1.1-ALv2` (see `LICENSE` in this package): free
for any use except selling AgentLintel itself, and each release becomes
Apache-2.0 two years after publication. Everything under `templates/` — the
files `init` copies into your repository — is Apache-2.0, so nothing
fair-source-licensed enters your project. Your code and the tool's output are
yours.
