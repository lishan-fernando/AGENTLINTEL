---
name: prove-stateful-workflow
description: Use when a feature changes persisted state, retries, events, or multi-step outcomes and must be proven beyond source-shape checks.
---

# Prove Stateful Workflow

Source shape cannot prove a state machine. Freeze the observable journey before
implementation and make the native executable check the authority.

## Workflow

1. Write the state table: prior state, command/event, next state, durable side
   effects, emitted messages, and externally visible result.
2. List adversarial transitions: duplicate delivery, retry after partial work,
   out-of-order events, concurrent commands, cancellation, and stale reads.
3. Identify the real persistence/deployment discovery path. Do not accept a
   source file, migration filename, or registration token as proof it runs.
4. Add held-out journey tests through the public boundary. Assert durable state
   and externally visible outcomes after reload, not only mock interactions.
5. Add one contradiction test for every pair of outcomes that must never both
   occur. Add idempotency assertions where retries are possible.
6. Run the held-out tests against the same wiring used in deployment, then run
   the full native suite and `agentlintel verify`.

## Evidence Rules

Keep shape checks as early feedback, but never label them behavioral proof.
Mocks may isolate a failure; at least one test must traverse real registration
and persistence wiring. A green gate with a skipped or undiscoverable journey
test is a failure.

## Completion

Report the state table, held-out journeys, contradiction pairs, deployment
discovery command, durable assertions, native results, and AgentLintel result.
