# ADR-006: v2 lean restructure — verified, append-only, or deleted

Date: 2026-06-10
Status: Accepted
Supersedes: ADR-001 (partially), ADR-002, ADR-003 (mechanism replaced; intent retained)

## Context

v1 shipped ~40 concepts, 17 file types, 10 schemas, 27 rules (18 of them
instruction-only), eight compile targets, and orchestration metadata with no
executor. In a private pre-v2 deployment, the framework's own metadata drifted
away from the code and CI shape, and a *manual audit*, not the framework,
caught it. Meanwhile AGENTS.md (Linux Foundation
AAIF, Dec 2025) and Agent Skills (32+ tools) consolidated the instruction and
progressive-disclosure layers v1 was hand-rolling.

## Decision

1. **One law: verified, append-only, or deleted.** Every artifact is
   re-checked against the code by `agentlintel verify` (facts, rules,
   fixtures, guard, exemplars), or is append-only intent (ADRs), or is
   removed. Hand-maintained mirrors of code state are forbidden.
2. **Six concepts:** facts, rules, guard, exemplars, skills, decisions.
3. **A rule is only a rule if a machine can fail a PR over it.** The 18
   instruction-only rules become one-line principles in AGENTS.md. Seven
   rules remain, all fixture-backed, including a deterministic heuristic for
   `boundary.validation` (raw-cast detection).
4. **Ride the standards.** AGENTS.md is hand-written (≤150 lines), CLAUDE.md
   says "Read AGENTS.md", workflows ship as SKILL.md. All compile targets,
   the index router, and modes are deleted.
5. **CLI = init, verify, report.** Nothing else. Plain Node, one dependency.

## Consequences

- Always-load drops from ~21K measured tokens to ≤2K.
- Drift of that class is now a CI failure (stale fact), not an audit finding.
- Cross-repo consistency is achieved by sharing the same rules.yaml +
  fixtures across repos, not by an orchestrator: simpler, weaker, shippable.
- v1 adopters migrate by running `agentlintel init` and porting facts; there
  is no automated migration — v1 had no known external adopters.
