# ADR-002: Deterministic-First Planning

- **Status:** Accepted
- **Date:** 2026-05-06
- **Owner:** AgentLintel Maintainers
- **Scope:** BOW planning, task classification, card and ADR selection

## Context

Natural-language tasks are ambiguous, so AI can help classify intent. However, letting an LLM choose rules and context without validation can load too much context, miss required policies, or invent files.

The planner needs to be cheap, predictable, and explainable before it becomes smart.

## Decision

Planning is deterministic first.

The baseline planner uses local metadata: `index.yaml`, `modes.yaml`, task cards, ADR metadata, rule IDs, and verification commands. AI-assisted classification may be added later as a bounded step that returns structured selection data.

Any AI-assisted selection must be validated deterministically before a prompt is written.

## Consequences

- The CLI can run offline and without credentials.
- Users can inspect why a card or ADR was selected.
- Token use stays bounded because the planner sends or reads metadata before full documents.
- AI can still be added later for ambiguous tasks without becoming the source of truth.

## Rejected Alternatives

- **Always call an LLM for planning.** Better natural-language handling, but higher cost and lower predictability.
- **Manual checklist only.** Good control, but pushes too much work back to the user.
- **Load every rule and ADR.** Simple implementation, but defeats AgentLintel's token-control goal.
