---
name: strangler-extraction
description: Use when extracting a business capability from a monolith into a slice or service.
---

# Strangler Extraction

Read `.agentlintel/facts.yaml`, pick the matching exemplar, and keep
`agentlintel verify` green after each writing phase. Do not add exemptions to
make progress; exemptions need Reason, Approver, Expires, Owner, and a human
decision.

## Phases

1. Discover boundary: entry points, domain concepts, data, messages,
   integrations, non-goals, and human decisions. Move no code.
2. Extract capability: pin current behavior, mirror the exemplar, move domain
   then application then infrastructure/interface, and preserve behavior.
3. Extract contract: expose the smallest stable public surface, validate input,
   catalog new error codes, and keep internals private.
4. Split data ownership: one owner writes; other slices use contracts,
   projections, or events. Record migration/rollback notes before data moves.
5. Add strangler facade: route old/new paths with telemetry, fallback, rollback
   criteria, and legacy-removal criteria.

## Hard Stops

- Boundary cannot be stated as one business capability.
- No matching exemplar exists.
- Domain imports framework, IO, database, network, or cloud SDKs.
- Public contract leaks persistence or private slice types.
- Cross-slice writes remain unowned.
- Verification or characterization checks fail without an explicit decision.

## Completion

Report phase reached, files changed, contract impact, new error codes, verify
and build/test output, and remaining risks or decisions.
