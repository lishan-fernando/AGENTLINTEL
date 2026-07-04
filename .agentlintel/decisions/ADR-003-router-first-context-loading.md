# ADR-003: Router-First Context Loading

- **Status:** Accepted
- **Date:** 2026-05-06
- **Owner:** AgentLintel Maintainers
- **Scope:** Agent and CLI context-loading behavior

## Context

AgentLintel's value depends on discipline, but governance files can become large. If every task loads every rule, ADR, fixture, and template, the system becomes slow, costly, and less likely to be followed.

The first pilot showed that sophistication can be kept if the first loaded files route context instead of explaining everything.

## Decision

AgentLintel uses a router-first loading model.

Agents and tools load `AGENTS.md`, `.agentlintel/context.yaml`, `.agentlintel/index.yaml`, and `.agentlintel/modes.yaml` first. Those files classify the request, select mode, and point to the smallest relevant task card, ADR, rule entry, schema, fixture family, or template.

Long rationale belongs in docs or ADRs and is loaded only when the selected mode or task intersects it.

## Consequences

- Routine work stays cheap.
- Audit work can still load deeper context with explicit gates.
- The CLI can compile prompts from metadata instead of concatenating the whole repository.
- Maintaining routing metadata becomes part of product quality.

## Rejected Alternatives

- **Single giant AGENTS.md.** Easy to discover, but expensive and brittle.
- **Only implicit agent judgment.** Flexible, but not measurable or reliable across tools.
- **Hardcode routing in the CLI.** Fast initially, but makes the product less portable and harder for adopters to customize.
