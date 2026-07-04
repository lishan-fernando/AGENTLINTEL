# ADR-004: Extraction Workflow Pack

- **Status:** Accepted
- **Date:** 2026-05-06
- **Owner:** AgentLintel Maintainers
- **Scope:** Monolith-to-service extraction task routing

## Context

AgentLintel's strongest commercial wedge is not generic prompt hygiene. It is making AI-assisted extraction safer when teams move business capabilities from a monolith into smaller services or slices.

Generic governance cards are not enough for that workflow. Extraction work has recurring decisions: where the bounded context starts and ends, what contract becomes public, who owns data, how legacy callers are routed, and how compatibility is preserved during transition.

## Decision

AgentLintel ships an extraction workflow pack as first-class routing metadata.

The initial pack includes task cards for bounded-context discovery, capability extraction, contract extraction, data ownership split, and strangler facades. Planner classification should recognize terms such as `extract`, `legacy`, `monolith`, `microservice`, `bounded context`, `contract`, `schema`, and `strangler`.

The pack remains guidance and planning metadata. Enforcement belongs in `agentlintel verify` and language-specific adapters.

## Consequences

- First-time users trying AgentLintel for extraction get useful routing without authoring every card from scratch.
- The official kit better matches the commercial scenario it claims to help.
- The planner can stay deterministic while still feeling domain-aware.
- More workflow packs may be added later, but extraction remains the first wedge.

## Rejected Alternatives

- **Keep only generic governance cards.** Too abstract for the first paid experience.
- **Make extraction planning AI-only.** Better language handling, but weaker offline and deterministic guarantees.
- **Embed all extraction guidance in README.** Easier to write, harder for tools to route and compile into BOW prompts.
