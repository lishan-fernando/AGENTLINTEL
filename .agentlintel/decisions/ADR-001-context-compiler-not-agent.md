# ADR-001: AgentLintel CLI Is a Context Compiler, Not a Coding Agent

- **Status:** Accepted
- **Date:** 2026-05-06
- **Owner:** AgentLintel Maintainers
- **Scope:** AgentLintel CLI and generated BOW artifacts

## Context

Coding agents already exist in the developer workflow: Cursor, Codex, Claude, Copilot, and similar tools. Competing with them directly would duplicate their hardest work and make AgentLintel harder to trust.

AgentLintel's sharper value is before and after those agents run: select bounded context, generate a work order, preserve architecture policy, and verify the result.

## Decision

The AgentLintel CLI starts as a context compiler and verifier coordinator.

The `plan` command may read governance metadata and write generated run artifacts under `.agentlintel/runs/<run-id>/`. It must not edit adopter application code.

Future `run` commands may invoke external coding agents through adapters, but those adapters remain optional. The source of truth stays in `.agentlintel` metadata and deterministic validation.

## Consequences

- Adoption is simpler because teams can keep their existing coding agent.
- The product can prove value through better prompts, smaller context, and clearer verification before taking on autonomous editing risk.
- Generated BOW files become auditable artifacts.
- Direct AI execution is deferred until the planner and verifier prove useful.

## Rejected Alternatives

- **Build a full coding agent first.** Too much surface area and no clear advantage over established tools.
- **Make the CLI edit code during planning.** Blurs planning and execution, increasing trust and rollback risk.
- **Make AI classification mandatory.** Raises cost and nondeterminism before the deterministic baseline is proven.
