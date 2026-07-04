# ADR-009: Tighten secret logging to values, not static message text

Date: 2026-07-03
Status: Accepted

## Context

The five-repo v2 migration for one case-study workspace found that
`secrets.no-logging` reported eight violations where the log message mentioned words such as
`token` or `secret`, but did not log the sensitive value. Examples included
static operational messages like "Session token not found" and exception messages
for secret metadata operations that logged only a non-secret resource id.

The original broad regex was useful as a safety floor, but it made a clean repo
red with noise. A red gate that humans learn to ignore is worse than a narrower
rule with explicit fixtures.

## Decision

`secrets.no-logging` now fails when a sensitive identifier appears in the logged
argument payload, including structured objects and message-plus-sensitive-value
calls. Static message text may contain security vocabulary when the logged values
are non-sensitive identifiers.

A new conformance pass fixture, `pass-static-sensitive-term`, locks this behavior
so future broadening or narrowing is visible.

## Consequences

- The rule no longer blocks safe operational messages about tokens or secrets.
- The rule still blocks direct logging of values named like `token`, `sessionToken`,
  `password`, or `secret`.
- More advanced semantic cases remain the job of language-native analyzers or
  external security scanners wired through `engine: external`.
