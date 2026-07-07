# ADR-005: Cross-Repo Architectural Enforcement Is The Lead Mission

- **Status:** Accepted
- **Date:** 2026-05-19
- **Supersedes:** None
- **Refines:** [ADR-004 Extraction Workflow Pack](./ADR-004-extraction-workflow-pack.md)

## Context

After the v0.3 source preview shipped, the cross-repo architectural consistency problem became visible as the highest-leverage thing AgentLintel can solve. Specifically:

- AI coding agents, given the same architectural decision in two different prompts or two different repositories, will produce two different implementations. One repo gets `Result<T, E>` from `@/shared/result`; the next gets `Either<L, R>` from `fp-ts`; the third re-implements `class Result { ok, err }` locally.
- The drift accumulates faster than human review can catch it, especially during a monolith → microservice extraction when 4–20 new services appear in 6–18 months.
- The consolidated AAIF standards do not address this:
  - **AGENTS.md** is single-repo by design.
  - **SKILL.md / Agent Skills** is portable-skill packaging without policy.
  - **MCP** is transport, not policy.
  - **ArchUnit / ArchUnitTS / ts-arch / dependency-cruiser** all run inside one repository.
  - **AWS Kiro's SMT-based requirements verification** is per-project, not cross-fleet.

This is an open gap that AgentLintel's existing primitives (context.yaml fact declarations, exemplar registration, error-code pattern, manifest schema, orchestrator-policy / worker-registry / thinking-modes triad) already point at, but did not previously enforce.

ADR-004 declared that "Multi-repo requires versioned contracts + central architecture registry (schema registry + service catalog + manifest aggregator)." This ADR ships the registry and the consistency-check that ADR-004 anticipated.

## Decision

For v0.4, **cross-repo architectural enforcement becomes the lead mission of AgentLintel**, with the extraction workflow as the flagship use case. The kit ships:

1. **`agentlintel consistency-check`** — a multi-repo command. Inputs: a `repos.yaml` manifest or a list of repo paths. Verifies across every repo that primitive paths (`Result`, `ExecutionContext`), validation library, error-code grammar, exemplar shape, agentlintel contract, and architecture profile all match. Outputs a per-key drift report with severity (`error` for divergent primitive paths and error patterns; `warning` for divergent validation library or architecture profile; `info` for exemplar-shape drift). Supports `--exit-on-drift` for CI.
2. **`agentlintel registry sync` / `registry diff` / `registry list`** — the central architecture registry from ADR-004. `sync` aggregates `.agentlintel/context.yaml` + `manifest.yaml` from every repo in `repos.yaml` into one local registry directory. `diff` runs `consistency-check` against the registry. `list` enumerates synced repos with metadata. The orchestrator policy can point at the registry as the source of truth.
3. **`agentlintel drift`** — periodic drift reports comparing the current registry against a saved snapshot. Outputs the benchmark metric: "X architectural-style divergences per quarter, reduced to Y after AgentLintel rollout."
4. **AAIF-compatible compile targets `agents-md` and `skills`** — alongside the existing six compile targets. `agents-md` emits an AAIF-conformant `AGENTS.md` with a Cross-Repo Consistency callout that references `consistency-check`. `skills` emits a `skills/` folder of five `SKILL.md` packages (context protocol, slices, exemption governance, maturity ladder, extraction workflow) compatible with 32+ AAIF-aligned tools.
5. **Real tokenizer with heuristic fallback** — `agentlintel estimate --model claude-opus-4-6 --model gpt-5-pro` returns real per-model token counts when `@anthropic-ai/tokenizer` and / or `js-tiktoken` are installed; the 1-char-per-4-tokens heuristic remains for unknown models and uninstalled tokenizer cases.
6. **Distribution infrastructure** — root `package.json` with workspaces declaring `@agentlintel/cli` as the publishable workspace; `.github/actions/agentlintel/action.yml` as a composite GitHub Action adopters can reference in three lines of YAML; `.pre-commit-hooks.yaml` exposing `agentlintel-verify` and `agentlintel-consistency-check` to the pre-commit framework; example workflow file under `.github/workflows/example-adopter.yml`.
7. **CLI test scaffold** — `tools/agentlintel-cli/test/` with `node:test` (no extra dependency) covering: help text, unknown-command failure, `consistency-check` happy path / drift path / unreadable-repo path / `--exit-on-drift`, registry `sync` / `list` / `diff`, and golden-output shape tests for the new `agents-md` and `skills` compile targets.
8. **One new community pack** — `examples/nestjs/` as a starter overlay for NestJS modular monoliths, plus `examples/consistency-demo/` showing `consistency-check` running across all four packs in the kit.

## Non-Decisions (deliberately not in v0.4)

- The strategic-orchestrator runtime adapter (`@agentlintel/runtime-agentsdk`). The metadata stays as-is; the executor binding is v0.5 work because it depends on shipping a real adapter against Anthropic Agent SDK and validating against a design partner.
- TypeScript AST-backed rules (`@agentlintel/eslint-plugin`) and the .NET Roslyn analyzer. These are v0.5 work; v0.4 leaves the 18 model-instruction-only rules where they are.
- A named case study. Track outside the public repository until the participant has approved publication.
- AAIF submission of the modular-monolith extraction reference pack. After v0.4 ships and the SKILL.md output is validated against at least one external repo.

## Consequences

Positive:
- The lead positioning ("AgentLintel keeps AI coding agents writing identical architectural code across every microservice in a fleet, especially mid-extraction") becomes executable, not just documented.
- Adopters can install in three lines via the GitHub Action with no AgentLintel-specific bootstrap step.
- Output emits cleanly into the AAIF ecosystem (AGENTS.md + SKILL.md) and stops competing with consolidated standards.
- The kit's own `repository-checks` CI gains real coverage via the test scaffold (currently zero tests for the CLI).

Negative / accepted trade-offs:
- The CLI grows from 4,237 lines to ~5,130 lines in a single file. This is accepted for v0.4; a multi-file refactor without changing the public entry point is a v0.5 candidate.
- The new commands depend on the same regex-and-YAML enforcement style as the rest of the kit; they do not introduce AST analysis. That gap (ADR §"Technical Depth" track) remains for v0.5.
- The orchestrator metadata continues to exist without a runtime executor for the duration of v0.4. ADR-001's framing ("the CLI is a context compiler, not a coding agent") still holds; ADR-005 narrows the gap by making the cross-repo *contract* checkable even when the *generator* is still external.

## How to verify

- `npm test` runs the new test scaffold; all consistency-check / registry / golden tests must pass.
- `agentlintel consistency-check --repos examples/consistency-demo/repos.yaml --json` returns a structured report with at least the four kit packs.
- `agentlintel compile --target agents-md --stdout` returns an AAIF-conformant document with a `## Cross-Repo Consistency` section.
- `agentlintel compile --target skills --force` writes five `SKILL.md` files under `skills/` plus a `skills/README.md`.
- `agentlintel help` lists `consistency-check`, `registry sync|diff|list`, `drift`, `agents-md`, and `skills`.

## References

- [ADR-004 Extraction Workflow Pack](./ADR-004-extraction-workflow-pack.md) — declared the central registry requirement that this ADR ships.
- [ADR-001 CLI Is A Context Compiler, Not A Coding Agent](./ADR-001-context-compiler-not-agent.md) — the framing this ADR refines (the CLI is now also a *cross-repo policy checker*).
- AGENTS.md (https://agents.md) — AAIF AGENTS.md format.
- SKILL.md / Agent Skills (https://github.com/anthropics/skills) — AAIF SKILL.md format.
