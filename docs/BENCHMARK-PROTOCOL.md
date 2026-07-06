# Benchmark Protocol

Purpose: test whether AgentLintel reduces architecture-contract escapes before
review. Until this protocol is run publicly, impact claims stay bounded.

## Arms

Run each task with the same repo snapshot and agent model:

1. No AgentLintel.
2. AgentLintel installed and enforced.
3. Same rules pasted as plain prompt prose, no gate.

## Tasks

Use 4+ realistic changes per repo:

- add a slice/capability;
- touch a boundary handler;
- add or change an error code;
- introduce an integration or persistence path;
- refactor across a public/private surface.

Each task must have a reviewer-owned expected architecture contract before the
agent runs.

## Metrics

- Architecture violations reaching PR.
- Rule violations caught locally by `agentlintel verify`.
- Review comments needed to correct architecture drift.
- Time from prompt to mergeable diff.
- Exemptions added and whether they are complete/unexpired.

## Pass Criteria

AgentLintel is alpha-positive only if it reduces architecture escapes versus
both controls without materially increasing accepted-diff review cost.

## Anti-Cheating

- Freeze repo snapshots and prompts.
- Blind-review diffs before revealing arm.
- Keep product secrets out of artifacts.
- Publish anonymized task descriptions, commands, and raw counts.

## Executable Seed

`tools/agentlintel-cli/test/benchmark-protocol.test.js` is a mechanical seed:
it proves stale facts, rule drift, guard drift, expired exemptions, missing
fixtures, and rule weakening are detectable. It is not market evidence.
