# AgentLintel

[![Repository checks](https://github.com/lishan-fernando/AGENTLINTEL/actions/workflows/repository-checks.yml/badge.svg?branch=main)](https://github.com/lishan-fernando/AGENTLINTEL/actions/workflows/repository-checks.yml)
[![Release](https://img.shields.io/github/v/release/lishan-fernando/AGENTLINTEL?include_prereleases&label=release)](https://github.com/lishan-fernando/AGENTLINTEL/releases)

**AI coding agents forget architecture. AgentLintel makes your repo
architecture enforceable in CI.**

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.10/agentlintel-cli.tgz
npx agentlintel init
npx agentlintel verify
```

Use it when:

- AI agents keep inventing new folders, imports, layers, or error patterns.
- You are tired of repeating the same architecture instructions in every chat.
- You want pull requests to fail when repo conventions drift.

AgentLintel is early and looking for serious feedback. If this pain is familiar,
[open a feedback or pilot issue](https://github.com/lishan-fernando/AGENTLINTEL/issues/new?template=feedback.yml).
Please do not paste private code, secrets, customer data, or anything your team
would not want public.

AgentLintel is a local-first CLI plus a small repo contract. You state your
architecture once with verified facts, deterministic rules, write-boundary
guard zones, exemplars, standard Agent Skills, and append-only decisions.
Agents read the contract, mirror real code, and get fast machine feedback;
CI fails the pull request if the architecture gate is red.

No model calls. No hosted service. No custom context router. AgentLintel rides
the standards agents already read — `AGENTS.md` for always-load guidance and
`SKILL.md` for on-demand workflows — and adds the enforcement half.

It works with Claude Code, Cursor, Codex, GitHub Copilot, and any coding agent
that reads `AGENTS.md` or a native pointer to it. AgentLintel enforces your
architecture, not its own: vertical slices, layers, MVVM, or in-house rules.
Built-in engines provide a starter floor; `engine: external` wraps the
stack-native analyzers your team already trusts.

**Status:** `v2.0.0-alpha.10` · **License:** Fair Source ([FSL-1.1-ALv2](LICENSE); adoption surface [Apache-2.0](tools/agentlintel-cli/LICENSE-APACHE); [map](docs/LEGAL.md)) · **Requires:** Node.js >= 18

## The problem: AI coding agents drift

Teams that pair humans with AI agents hit three walls:

1. **Instructions do not persist.** You explain the architecture in a prompt.
   Ten sessions later — new chat, new model, compacted context — the agent
   invents a second error-handling style or a fourth folder convention.
2. **Instruction files are advisory.** Cursor rules, Copilot instructions, and
   plain `AGENTS.md` prose improve behavior but guarantee nothing: recent
   research measured instruction files dropped from the prompt roughly a third
   of the time, and 61–79% compliance on complex constraints
   ([arXiv:2512.18925](https://arxiv.org/abs/2512.18925)). Advice alone
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

- **Verified.** Every claim about the repo is re-checked on every run. A stale
  instruction is a red build, not a silent lie.
- **Deterministic.** Rules are executed by engines, not judged by a model.
  Same input, same verdict, exit code `0` or `1`. No scores, no vibes.
- **Enforced.** CI runs the same gate and fails the pull request. An
  instruction an agent could ignore becomes a diff that cannot merge.

Core law: **every governance artifact is machine-verified, append-only, or
deleted.** If architecture intent changes, record it once as an append-only ADR;
future agent sessions inherit the update.

## Quick start

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.10/agentlintel-cli.tgz
npx agentlintel init      # scaffold the contract (pick a pattern pack)
npx agentlintel verify    # run the gate locally
npx agentlintel explain --path src/example.ts  # debug what applies to a file
```

`init` offers pattern packs — `vertical-slice`, `layered-3tier`, `mvvm`, or
`custom` — plus optional glue: `--adapters`, `--hooks`, `--engine-adapters`,
and `--from-v1` for migrating v1 kits.

First-afternoon checklist:

1. Fill `facts.yaml` with the claims agents must never get wrong.
2. Register one exemplar — the existing code that best shows your
   conventions.
3. Trim the starter rules to the ones you actually believe.
4. Wire CI with `agentlintel verify --strict`.

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

Three reference skills ship with the framework: `strangler-extraction`,
`mirror-exemplar`, and `audit-architecture`.

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
`mvvm`, or `custom`. Every pack includes universal safety rules for secret
logging and audited exemptions (reason, approver, owner, expiry). Keep only the
rules you believe, because an unenforced rule nobody holds is noise.

Engines: `regex`, `layers`, `error-codes`, `exemptions`, and `external`. Treat
built-ins as a portable starter floor, not a type system or security scanner.
Use `external` for deep checks from tools your stack already trusts:
architecture tests, dependency-cruiser, `dotnet test`, commit and PR policies.

Rule changes are ratcheted: tightening is free, but deleting, weakening, or
narrowing a rule requires an ADR in the same diff. Guardrails cannot erode
silently.

## Running the gate

Two loops, one gate:

```bash
# Inner loop — agents run this while working (seconds, diff-scoped)
npx agentlintel verify --diff --quiet --bail --no-run --skip-fixtures

# Outer loop — the CI merge gate (full, strict)
npx agentlintel verify --strict
```

GitHub Actions:

```yaml
- uses: actions/checkout@v4
- uses: lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2
  with:
    strict: "true"
```

Exit codes are the contract: `0` gate passed, `1` gate failed, `2` internal
error. `agentlintel report` renders the same checks as a Markdown summary
(facts freshness, violations, fixtures, guard, ratchet) for humans and
dashboards. Multi-repo workspaces aggregate with `verify --workspace`.

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

What adoption costs, honestly: one afternoon to state your intent (fill facts,
register an exemplar, trim rules, wire CI), and one ADR each time that intent
changes. That is the whole ongoing tax — the point is that you never again pay
the per-session re-explaining tax.

## AgentLintel alongside the tools you already use

AgentLintel replaces none of your existing quality stack. Linters keep style
clean, architecture-test tools provide stack-native depth, AI reviewers provide
probabilistic judgment, and instruction files guide the agent. AgentLintel adds
the deterministic floor beneath them: architecture rules that agents can read
and CI can enforce.

## What AgentLintel is not

Scope is a feature. AgentLintel is not an agent orchestrator, an instruction
compiler, a static-analysis replacement, a code-review replacement, a
certification scheme, a token meter, or a hosted telemetry service. It is
metadata plus a CLI — no runtime, no model calls, no lock-in: delete
`.agentlintel/` and you have exactly the repo you had before.

The claim today, stated precisely: AgentLintel makes architecture instructions
durable, visible to agents, and enforceable in CI.

## Repository map

| Path | What |
|---|---|
| [SPEC.md](SPEC.md) | The normative v2 spec (<= 500 lines) |
| [.agentlintel/](.agentlintel/) | This repo's own contract — AgentLintel governs itself |
| [tools/agentlintel-cli/](tools/agentlintel-cli/) | The CLI: `init`, `verify`, `report`, `explain` — plain Node.js, one dependency |
| [docs/](docs/) | Adoption playbook, launch playbook, design rationale, benchmark protocol, evidence summary |

This repository dogfoods the governance mechanics: the six concepts above are
live here, the CLI is fixture-tested, and CI runs `verify --strict` on every
pull request. It is not itself a production vertical-slice application; the
slice-shaped reference rules stay as conformance-backed starter rules —
reported as dormant by `verify` on every run — until an adopter repo flips
them to `must_match: true`.

## Status

`v2.0.0-alpha.10`, fair source, Node.js >= 18. Free to use and to build your
own software with: everything `init` scaffolds into your repo is
[Apache-2.0](tools/agentlintel-cli/LICENSE-APACHE), and the core is [FSL-1.1-ALv2](LICENSE) — any
use except selling AgentLintel itself, with each release becoming Apache-2.0
open source two years after publication
([docs/LEGAL.md](docs/LEGAL.md) has the one-page map). The
six-concept contract is stable by law; CLI surface changes require an accepted
ADR and must not add kernel concepts.
File formats may still see minor changes before `v2.0.0`. Feedback and drift
war stories are welcome in the issue tracker.
