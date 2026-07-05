# Competitive Positioning - July 2026

## Thesis

AgentLintel is a deterministic architecture gate for AI-agent codebases. It
does not replace AGENTS.md, Agent Skills, dependency-cruiser, ArchUnit, test
suites, or code review; it packages their useful boundary into one small repo
contract: facts, rules, guard, exemplars, skills, decisions. The gate verdict
is deterministic; the strength of the detection depends on the configured
engine, with `external` as the path for native semantic analyzers.

## Where It Wins

- Standards-shaped delivery: `AGENTS.md` and `SKILL.md`, not custom context
  routers.
- Rule discipline: no rule without a machine-failing gate and fixtures.
- Exemplar mirroring: agents copy canonical working code instead of guessing.
- Ratchet: weakening rules requires an ADR in the same diff.
- Local-first CLI: no model calls, telemetry, or runtime dependency.

## Exposed Areas

- Public causal evidence is not complete until the benchmark protocol runs.
- Regex rules are a floor; deeper checks should use native external engines.
- The framework repo dogfoods the governance mechanics, not a production slice
  architecture.
- Runtime CLI source should stay readable in the shipped package; opaque bundles
  undermine the audit story.
- Adoption depends on keeping docs and templates small enough to read.

## Claims To Use

- "Deterministic architecture gate for AI-agent codebases."
- "Built-in rules are portable starter checks; `engine: external` wraps the
  analyzers your stack already trusts."
- "Verified facts, enforceable rules, conformance fixtures, write-boundary
  guard, exemplar registry, standard Agent Skills, append-only ADRs."
- "Local-first: metadata plus a CLI, not a runtime."

## Claims To Avoid

- "Proven causal impact" before benchmark results.
- "Works for every stack."
- "Fully automatic governance."
- "Replacement for static analysis or code review."
- "Guaranteed to prevent architecture drift."
- "Regex checks prove semantic architecture."
