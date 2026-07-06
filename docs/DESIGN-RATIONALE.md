# Design Rationale

AgentLintel's current architecture is intentionally small: one always-load
file, three CLI commands, six concepts, and no hand-maintained metadata that
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
- `.agentlintel/skills/*/SKILL.md`: workflows.
- `.agentlintel/decisions/ADR-*.md`: append-only rationale.
- `.agentlintel/conformance/<rule>/cases`: fixtures proving rules.

## Deleted From Earlier Designs

Routers, mode files, orchestration manifests, generated context bundles,
metadata mirrors, and maturity taxonomies are gone. If a file cannot be checked
by `agentlintel verify` and is not an ADR, it should not exist.

## CLI

`init`, `verify`, and `report` only. Extra behavior is a flag, not a new
command. `verify --strict` is the merge gate; `verify --diff --quiet --bail
--no-run --skip-fixtures` is the fast agent-loop path.

## Rationale

Agents need small context and hard feedback. Long prose makes drift easier;
verified facts, fixtures, guard zones, and exemplars make drift visible.
