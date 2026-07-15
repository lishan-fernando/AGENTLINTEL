# Design Rationale

AgentLintel's current architecture is intentionally small: one always-load
file, four CLI commands, six concepts, and no hand-maintained metadata that
mirrors code.

## Laws

1. Verified, append-only, or deleted.
2. A rule exists only if a machine can fail a PR over it.
3. Six concepts: facts, rules, guard, exemplars, skills, decisions.
4. Use standards: `AGENTS.md` and `SKILL.md`.
5. Always-load stays under about 2K tokens.

## File Set

- `AGENTS.md`: the only always-load instruction file.
- `.agentlintel/facts.yaml`: checked claims.
- `.agentlintel/rules.yaml`: deterministic rules.
- `.agentlintel/guard.json`: write zones.
- `.agentlintel/exemplars.yaml`: canonical examples agents mirror.
- `.agents/skills/*/SKILL.md`: workflows.
- `.agentlintel/decisions/ADR-*.md`: append-only rationale.
- `.agentlintel/conformance/<rule>/cases`: fixtures proving rules.

## Deleted From Earlier Designs

Routers, mode files, orchestration manifests, generated context bundles,
metadata mirrors, and maturity taxonomies are gone. If a file cannot be checked
by `agentlintel verify` and is not an ADR, it should not exist.

## CLI

`init`, `verify`, `report`, and `explain` only. Extra behavior is a flag, not a
new command. `verify --strict --base <target-sha>` is the full merge gate;
`verify --diff --quiet --bail --no-run --skip-fixtures` is the intentionally
incomplete fast agent-loop path.

## Rationale

Agents need small context and hard feedback. Long prose makes drift easier;
verified facts, fixtures, guard zones, and exemplars make drift visible.
`explain --shape --compact` selects a pre-write frontier from those existing
concepts and reports a versionable-byte token proxy. The shipped acceptance
test requires at least 50 percent less context than loading the full governance
surface. This is not a claim about actual model tokens; matched-agent runs must
measure those separately.

ADRs do not authenticate authors. They grant only exact exemption tuples or
exact ratchet findings, while branch protection authenticates who may merge
them. Registered exemplar bytes and declared external-checker evidence are
protected so an agent cannot weaken the judge and then satisfy it.
