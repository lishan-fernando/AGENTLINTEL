# AGENTS.md — AGENTLINTEL (the framework repo)

This repo IS AgentLintel v2: a deterministic architecture gate for AI-agent
codebases, delivered as AGENTS.md conventions + Agent Skills + a small CLI.
This file is the only always-load. Keep it under 150 lines.

## v2 laws (apply to every change in this repo)

1. **Verified, append-only, or deleted.** Every artifact is machine-checked by
   `agentlintel verify`, is an append-only ADR, or must not exist. Never add
   hand-maintained metadata that mirrors code state.
2. **A rule is only a rule if a machine can fail a PR over it.** Rules live in
   `.agentlintel/rules.yaml` and require fixtures in `.agentlintel/conformance/<id>/`.
   Advice is a principle (one line here), not a rule.
3. **≤ 6 concepts:** facts, rules, guard, exemplars, skills, decisions.
   Reject any change that introduces a seventh.
4. **Ride the standards.** AGENTS.md and SKILL.md are the delivery format.
   Never reintroduce compile targets, routers, or mode files.
5. **Always-load ≤ 2K tokens.** This file plus skill frontmatters.

## Verify (the gate)

```
cd tools/agentlintel-cli && npm ci --no-audit --no-fund
node bin/agentlintel.js verify --dir ../..
npm test
```

Run both before declaring any task done. CI runs the same (with --strict).
Fast agent-loop path: `verify --diff --quiet --bail --no-run --skip-fixtures`.
Templates under tools/agentlintel-cli/templates/{conformance,skills} are a
machine-verified mirror of .agentlintel/ - change both or the sync test fails.

## Map

| Path | What |
|---|---|
| `.agentlintel/facts.yaml` | machine-checked project facts |
| `.agentlintel/rules.yaml` | 7 deterministic rules (regex / error-codes / exemptions engines) |
| `.agentlintel/guard.json` | write-boundary zones checked against git diff |
| `.agentlintel/exemplars.yaml` | canonical exemplar registry |
| `.agentlintel/skills/` | 3 Agent Skills: strangler-extraction, mirror-exemplar, audit-architecture |
| `.agentlintel/decisions/` | append-only ADRs |
| `.agentlintel/conformance/` | pass/fail fixtures per rule (the framework's test suite) |
| `tools/agentlintel-cli/` | the CLI: `init`, `verify`, `report`, `explain` |
| `SPEC.md` | the full v2 spec for adopters (≤ 500 lines) |
| `docs/DESIGN-RATIONALE.md` | design rationale for the current lean architecture |

## Working on the CLI

- Plain Node >= 18, CommonJS, single dependency (`yaml`). No build step.
- Every engine change must keep `npm test` green; fixtures are the contract.
- New rule = rule entry + fixtures + tests, in the same PR, or it doesn't merge.
- Exit codes: 0 gate passed, 1 gate failed, 2 internal error. Documented in `SPEC.md`.

## The five architecture principles

1. A slice is one business capability, not one technical layer.
2. One public file per slice (`index`); everything else is private.
3. `Result<T, E>` for expected business failures; throw only for bugs.
4. Validate untrusted input at every boundary before business logic.
5. Error codes are stable and slice-local: `<SLICE>-<CATEGORY>-<NUMBER>`.

## Principles (advice, not machine-enforced)

- Don't abstract until duplication occurs three times and is semantically identical.
- `shared/` is generic; business-specific code belongs in a slice.
- Slices write only to their own schema; cross-slice access via public contracts.
- Exemptions use `AGENTLINTEL-EXEMPT` with Reason, Approver, Expires, Owner —
  expired or incomplete exemptions fail the gate.

## Intent

Decisions and their rationale live in `.agentlintel/decisions/` as ADRs.
Append, never edit; supersede with a new ADR.
