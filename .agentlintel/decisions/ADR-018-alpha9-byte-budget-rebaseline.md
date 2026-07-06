# ADR-018: Rebaseline the alpha.9 tracked-byte budget

Date: 2026-07-06

## Status

Accepted

## Context

The alpha.9 hygiene pass removed stale historical docs and root lockfile churn,
but it also added release-surface checks, reliability tests, and ADR-017. The
Linux release gate measured the committed tree at 400,417 normalized tracked
bytes, 417 bytes over the frozen 400,000-byte cap.

## Decision

Raise the tracked repository byte budget to 402,000 bytes for the alpha.9
release. Keep the eligible movable-payload budget unchanged.

## Consequences

The cap still leaves less than 0.4% slack over the measured committed tree while
preserving the lean-budget tripwire for future growth. Any later increase still
requires a new ADR.
