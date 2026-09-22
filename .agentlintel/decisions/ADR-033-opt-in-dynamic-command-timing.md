# ADR-033: Make dynamic command timing observable on demand

Accepted: 2026-09-22

## Context

Full verification can run repository-declared command facts and external
rules. Their elapsed time was not attributable by stable contract ID, making
CI latency difficult to investigate without exposing command details.

Decision:

`verify` and `report` accept opt-in `--timing` and `--progress`. Timing adds
only total elapsed milliseconds and `{kind, id, elapsedMs, status}` records
for command facts and external rules. Progress writes JSONL `started` and
`completed` events to stderr using the same stable IDs. Neither surface logs a
command, its output, or its environment. The GitHub Action forwards matching
boolean inputs.

## Consequences

Default output and result objects remain unchanged. Instrumentation does not
cache, skip, retry, or otherwise alter command execution or gate semantics.
The executable byte caps are recalibrated to 844,000 versionable bytes,
492,000 eligible bytes, and 361,000 packaged bytes, each with less than one
percent headroom over this measured implementation.

Authorizes-Weakening: {"artifact":".agentlintel/exemplars.yaml","finding":"exemplar 'cli-command-test' implementation changed at 'tools/agentlintel-cli/test/cli.test.js'"}
