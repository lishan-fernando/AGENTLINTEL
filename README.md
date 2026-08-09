# AgentLintel

[![Repository checks](https://github.com/lishan-fernando/AGENTLINTEL/actions/workflows/repository-checks.yml/badge.svg?branch=main)](https://github.com/lishan-fernando/AGENTLINTEL/actions/workflows/repository-checks.yml)
[![Release](https://img.shields.io/github/v/release/lishan-fernando/AGENTLINTEL?include_prereleases&label=release)](https://github.com/lishan-fernando/AGENTLINTEL/releases)
[![npm alpha](https://img.shields.io/npm/v/%40agentlintel%2Fcli/alpha?label=npm%20alpha)](https://www.npmjs.com/package/@agentlintel/cli)

**AI coding agents forget architecture. AgentLintel makes your repo
architecture enforceable in CI.**

```bash
npm i -D @agentlintel/cli@alpha
npx agentlintel init
npx agentlintel verify
```

The public npm package is
[`@agentlintel/cli`](https://www.npmjs.com/package/@agentlintel/cli). During
alpha, install from the `alpha` dist-tag for the newest prerelease; the
unqualified npm `latest` tag may intentionally trail until a stable cut.

Use it when:

- AI agents keep inventing new folders, imports, layers, or error patterns.
- You are tired of repeating the same architecture instructions in every chat.
- You want pull requests to fail when repo conventions drift.

AgentLintel is early and looking for serious, sanitized feedback. If this pain
is familiar, [open a public feedback issue](https://github.com/lishan-fernando/AGENTLINTEL/issues/new?template=feedback.yml).
Please keep private code, secrets, customer data, and sensitive adoption
context out of public issues.

AgentLintel is a local-first CLI plus a small repo contract. You state your
architecture once with verified facts, deterministic rules, write-boundary
guard zones, exemplars, standard Agent Skills, and append-only decisions.
Agents read the contract, mirror real code, and get fast machine feedback;
CI fails the pull request if the architecture gate is red.

No model calls. No hosted service. No custom context router. AgentLintel rides
the standards agents already read — `AGENTS.md` for always-load guidance and
`SKILL.md` for on-demand workflows — and adds the enforcement half.

AgentLintel is designed for Claude Code, Cursor, Codex, GitHub Copilot, and any
coding-agent workflow that can read `AGENTS.md` or a pointer to it. The
enforcement path is agent-independent: the CLI and CI gate decide pass/fail.
For Claude Code, `init` writes that pointer as the one-line `@AGENTS.md`
import, preserving one instruction source.
AgentLintel enforces your architecture, not its own: vertical slices, layers,
MVVM, or in-house rules. Built-in engines provide a starter floor; set
`engine: external` to wrap the stack-native analyzers your team already trusts.

**Status:** `v2.0.0-alpha.14` - npm `@agentlintel/cli@alpha` -
Source-available free use - Node.js >= 18

## The problem: AI coding agents drift

Teams that pair humans with AI agents hit three walls:

1. **Instructions do not persist.** You explain the architecture in a prompt.
   Ten sessions later — new chat, new model, compacted context — the agent
   invents a second error-handling style or a fourth folder convention.
2. **Instruction files are advisory.** Cursor rules, Copilot instructions, and
   plain `AGENTS.md` prose can guide agents, but they do not create a merge
   gate. Recent empirical work shows developers already write persistent
   AI-assistant rule files at scale, while the actual performance impact of
   those rules remains an open research question
   ([arXiv:2512.18925](https://arxiv.org/abs/2512.18925)). Advice alone still
   drifts.
3. **Hand-maintained context rots.** Architecture docs and metadata written
   for agents go stale silently — and then agents follow the stale version
   faithfully.

Drift compounds. Humans restate the same intent in every session and relitigate
it in every review.

## The idea: instruct once, enforce always

AgentLintel moves architectural intent out of chat history and into a small
contract the repository carries. The contract has three properties prose never
has:

- **Verified.** Every enabled claim about the repo is re-checked on every run. A stale
  instruction is a red build, not a silent lie.
- **Deterministic.** Built-in rules are executed by engines, not judged by a
  model. Repository bytes, comparison base, date-sensitive exemptions, and
  configured command output are explicit evidence. No scores, no vibes.
- **Enforced.** CI runs the same gate and fails the pull request. An
  instruction an agent could ignore becomes a diff that cannot merge.

Core law: **every governance artifact is machine-verified, append-only, or
deleted.** If architecture intent changes, record it once as an append-only ADR;
future agent sessions inherit the update.

## Quick start

```bash
npm i -D @agentlintel/cli@alpha
npx agentlintel init      # scaffold the contract (pick a pattern pack)
npx agentlintel verify    # run the gate locally
npx agentlintel explain --path src/example.ts  # debug what applies to a file
npx agentlintel explain --path src/example.ts --shape service --compact
```

Need an exact release artifact or a registry-free fallback?

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.14/agentlintel-cli.tgz
```

`init` offers pattern packs — `vertical-slice`, `layered-3tier`, `mvvm`, or
`custom` — plus optional glue: `--adapters`, `--hooks`, `--engine-adapters`,
and `--from-v1` for migrating v1 kits.

First-afternoon checklist:

1. Fill `facts.yaml` with the claims agents must never get wrong.
2. Register one exemplar — the existing code that best shows your
   conventions.
3. Trim the starter rules to the ones you actually believe.
4. Wire CI with the Action below, or pass the target branch SHA with
   `agentlintel verify --strict --base <sha>`.

From then on, the contract changes only when your intent changes.

## Inside the contract: six concepts

AgentLintel's whole surface is six concepts. Rejecting a seventh is a design
law, so the contract stays learnable in minutes — by humans and by agents.

- **facts**: checked claims about the repo.
- **rules**: deterministic checks with pass/fail fixtures.
- **guard**: write-boundary zones checked against the diff.
- **exemplars**: canonical code agents should mirror.
- **skills**: standard `SKILL.md` workflows loaded only when relevant.
- **decisions**: append-only ADRs for architecture changes.

Five reference skills ship: `strangler-extraction`, `mirror-exemplar`,
`audit-architecture`, `scope-change`, and `prove-stateful-workflow`.

## Rules and engines

**A rule is only a rule if a machine can fail a pull request over it.**
Everything else is advice, and advice lives in `AGENTS.md` as one-line
principles — with no enforcement pretense.

AgentLintel has no architecture opinion of its own. Vertical slices, layered
3-tier, MVVM, hexagonal, or the in-house convention only your team uses — the
framework is the enforcement layer, and your architecture is configuration in
plain files you own: `rules.yaml` (what must hold), `guard.json` (where
changes may land), `exemplars.yaml` (what good looks like).

Fixture-backed starter rules catch drift like:

- `slice.no-deep-imports`: a feature imports another slice's private domain
  file instead of its public index.
- `boundary.validation`: a route casts raw request input before validation.
- `secrets.no-logging`: code logs a token, key, password, or regulated data.

Pattern packs are starting templates: `vertical-slice`, `layered-3tier`,
`mvvm`, or `custom`. Every pack includes cross-pattern starter checks for
likely secret-value logging and structured exemptions. They are deterministic
heuristics, not a secret scanner or proof of approval. Keep only the rules you
believe, because an unenforced rule nobody holds is noise.

Engines: `regex`, `layers`, `error-codes`, `exemptions`, and `external`. The
built-in layer importer is deliberately JS/TS-only. Treat built-ins as a
portable starter floor, not a type system or security scanner.
Use `external` for deep checks from tools your stack already trusts:
architecture tests, dependency-cruiser, `dotnet test`, SARIF 2.1 analyzers,
commit and PR policies. The generated .NET SARIF bridge preserves diagnostic
id, repository file, line, and column without adding a C# parser to AgentLintel.
Each external rule declares exact `evidence` files; changing its checker,
configuration, or lock evidence is ratcheted.

Contract changes are ratcheted: weakening or relabeling a fact, changing or
removing a registered exemplar implementation, changing external evidence,
weakening a rule, or broadening the write guard requires an exact
`Authorizes-Weakening` finding in a **new** ADR in the same diff. An unrelated
ADR authorizes nothing. Additions and monotonic tightening stay free.
Existing ADRs cannot be edited or deleted. Every rule must prove both a
passing and failing fixture; guardrails cannot erase their own evidence.

Brownfield repositories can opt a built-in file rule into
`enforcement: no-new`. The current rule runs against both the target commit and
the candidate tree: legacy findings stay visible, resolved debt is counted,
and only introduced findings block the pull request. The baseline comes from
Git—there is no violation snapshot to regenerate or drift. Full history and an
exact `--base` are required; external tools must implement their own trusted
baseline policy rather than receiving a false green.

## Running the gate

Two loops, one gate:

```bash
# Inner loop — agents run this while working (seconds, diff-scoped)
npx agentlintel verify --diff --quiet --bail --no-run --skip-fixtures

# Outer loop — the CI merge gate (full, strict)
npx agentlintel verify --strict --base <target-sha>
```

GitHub Actions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2.0.0-alpha.14
  with:
    strict: "true"
```

The Action derives an exact comparison SHA for pull requests, merge groups,
and pushes. Its default `no_run: auto` does not execute candidate-declared
commands on fork PRs or merge groups. If your contract contains command facts
or external rules, strict CI stays incomplete until a trusted run executes
them. Executable checks require a committed Git snapshot and fail the gate if
they change versionable state. Pin the Action to a commit SHA when policy requires it.

Run a Git-backed gate from the repository top-level with full history. Strict
mode requires the actual target/PR base SHA; `--diff`, `--skip-fixtures`, and
`--no-run` are intentionally incomplete. Governance used by the verdict must
be tracked rather than supplied only through ignored or untracked files.

Exit codes are the contract: `0` gate passed, `1` gate finding, `2`
invalid invocation or internal error. `agentlintel report` renders the same checks as a Markdown summary
(facts freshness, violations, fixtures, guard, ratchet) for humans and
dashboards. Multi-repo workspaces aggregate with `verify --workspace`.

An ADR records rationale, not authenticated approval. Protect the contract,
fixtures, verifier, and CI workflow with base-branch CODEOWNERS and required
review; the repository ships a concrete example.

## Is AgentLintel right for your project?

Adopt it when:

- Humans and AI agents will both commit to this codebase for months, not days.
- You have architecture opinions worth defending — boundaries, error
  contracts, module shapes — and you are tired of restating them every
  session.
- More than one agent, model, or person touches the code, and consistency
  across all of them is the actual problem.
- You run CI and can fail a pull request.

Skip it, for now, when:

- The project is a prototype you will throw away. Drift does not matter
  there.
- You have no CI and no plan for it. Without a merge gate you get only the
  advisory half, and advisory prose is the problem AgentLintel exists to fix.
- You want a tool that designs your architecture or orchestrates your agents.
  AgentLintel governs what agents produce; it does not produce.
- You expect a replacement for linters, tests, or code review. It sits beside
  them; it does not absorb them.

Adoption cost: one afternoon to state intent (facts, exemplar, rules, CI) and
one ADR each time that intent changes. The payoff is avoiding the per-session
re-explaining tax.

## What AgentLintel is not

Scope is a feature. AgentLintel is not an agent orchestrator, an instruction
compiler, a static-analysis replacement, a code-review replacement, a
certification scheme, a token meter, or a hosted telemetry service. It is
metadata plus a CLI — no runtime, no model calls, no lock-in: delete
`.agentlintel/`, `.agents/skills/`, and its generated instruction files to
remove AgentLintel.

The claim today, stated precisely: AgentLintel makes architecture instructions
durable, visible to agents, and enforceable in CI.

## Repository map

| Path | What |
|---|---|
| [SPEC.md](SPEC.md) | The normative v2 spec (<= 500 lines) |
| [.agents/skills/](.agents/skills/) | Standard on-demand Agent Skills |
| [.agentlintel/](.agentlintel/) | This repo's own contract — AgentLintel governs itself |
| [tools/agentlintel-cli/](tools/agentlintel-cli/) | The CLI: `init`, `verify`, `report`, `explain` — plain Node.js, one dependency |
| [docs/](docs/) | Adoption playbook, design rationale, benchmark protocol, security and privacy notes |

This repository dogfoods the governance mechanics: the six concepts above are
live here, the CLI is fixture-tested, and CI runs the strict Action with the
pull request base SHA. It is not itself a production vertical-slice application; the
slice-shaped reference rules stay as conformance-backed starter rules —
reported as dormant by `verify` on every run — until an adopter repo flips
them to `must_match: true`.

## Status

`v2.0.0-alpha.14`, npm `@agentlintel/cli@alpha`, source-available free use,
Node.js >= 18.

AgentLintel is free for personal, internal, commercial, client, and
non-commercial codebases. Using AgentLintel does **not** change the license of
your source code, product, repository, project-authored ADRs,
application-generated files, reports, or output. Your project remains yours.

License boundary:

- **Your project stays under your terms.** You can keep it private, sell it,
  open-source it, or use it internally.
- **AgentLintel-supplied starter templates are Apache-2.0.** Files copied by
  `agentlintel init` are permissive templates, safe to commit and modify in
  proprietary or open-source repositories, subject to normal Apache-2.0
  notice/license preservation for the copied template content.
- **AgentLintel core is source-available under the AgentLintel Free Use
  No-Resale License 1.0.** You may use it for your own projects and client
  projects, but you may not sell AgentLintel itself, a paid rebrand, a fork,
  or a substantially similar paid AgentLintel-like product or service.

See [docs/LEGAL.md](docs/LEGAL.md) for the license map. The six-concept
contract is a compatibility promise: facts, rules, guard, exemplars, skills,
and decisions. CLI surface changes require an accepted ADR and must not add
kernel concepts. File formats may still see minor changes before `v2.0.0`.
Public bugs, docs fixes, and sanitized drift examples are welcome in the issue
tracker.
