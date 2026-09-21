# ADR-031: Content-addressed strict-gate transactions

Accepted: 2026-09-21

## Context

Large native repositories can spend most of a strict verification run restoring,
building, generating contracts, reconstructing Git proofs, and recreating clean
checkouts. Repeating equivalent work across hostile cases turns a deterministic
gate into a 60–90 minute feedback loop. Caching only by command text would be
unsafe: moved refs, changed tools, authorization, packages, or source proofs
could reuse a verdict produced for different inputs.

AgentLintel needs faster orchestration without changing the meaning of
`agentlintel verify`, skipping the final strict gate, or adding a seventh
governance concept. Plans, bundles, cache entries, and receipts are generated
runtime evidence under an ignored directory; they are not versioned policy.

Decision:

1. Add `agentlintel gate prepare|verify|apply --config <json>`. The JSON file is
   the compact command contract; strict-gate state is never spread across a
   large environment-variable surface.
2. Prepare resolves exact source and target commits and binds the config, tool
   probes, package files, authorization files, and source proofs in a
   content-addressed plan. Source must descend from target.
3. Verify uses owned detached Git worktrees. Windows defaults to one worker;
   configuration may request 1–32. Equivalent non-final commands are executed
   once. Commands marked `final: true` must be last, always execute, and cannot
   use cached results.
4. Cache only commands with declared input and output evidence. Support the
   bounded categories restore, Release build, OpenAPI, contract evidence, Git
   proofs, and architecture compilation. Keys bind command shape, input bytes,
   tool proof, and package proof; entries and output manifests are written
   atomically and verified before restore.
5. A successful verification bundle binds the plan, both repository heads,
   every evidence digest, every strict result, and the timing report. Verify
   rechecks the binding after all commands. Any mismatch creates no bundle.
6. Apply recomputes the whole binding, rejects a checked-out or moved target,
   and advances the exact target ref with Git's compare-and-swap `update-ref`.
   It does not rerun or reinterpret the gate. This makes apply fast while a
   stale bundle cannot authorize a different commit.
7. Emit JSON progress events on stderr with stage, case/total, project, elapsed
   time, PID, cache status, and heartbeat state. Store slowest-command,
   slowest-rule, and stage timings in the bundle.
8. Cleanup is path-bounded. A workspace can be reset, cleaned, or removed only
   when it is inside the configured repository runtime, is a registered Git
   worktree, and has an exact ownership marker for the repository and source
   commit. Unrelated or ambiguous paths fail closed.
9. Prove the workflow through the public CLI: cache hit and command
   deduplication, uncached final verification, regular heartbeats, stale-input
   rejection with an unchanged target, failed-final rejection with no bundle,
   clean hostile worktree removal, and sub-minute atomic apply.
10. Rebaseline the three frozen byte budgets once for this capability and its
    journey tests: 826,000 versionable bytes, 485,000 eligible movable bytes,
    and 356,000 npm unpacked bytes. Each is the measured normalized total plus
    less than one percent headroom; dependency count and always-load budgets do
    not change.

Authorizes-Weakening: {"artifact":".agentlintel/exemplars.yaml","finding":"exemplar 'cli-command-test' implementation changed at 'tools/agentlintel-cli/test/cli.test.js'"}

## State table

| Prior state | Input | Next state | Durable effect | Visible result |
|---|---|---|---|---|
| candidate refs | prepare | prepared | atomic plan file | plan digest |
| prepared | verify, all commands pass | verified | caches + atomic bundle | timing and bundle digest |
| prepared | failure or changed input | rejected | safe caches only, no bundle | failing command/timing |
| verified | apply, exact binding | applied | one target-ref compare-and-swap + receipt | verified source head |
| verified | stale input/target | rejected | target unchanged | stale-bundle error |

## Rejected

- Caching by command text, timestamps, or branch names: none binds the source
  and authority that produced the verdict.
- Caching or deduplicating the final strict command: it would weaken production
  equivalence even when an earlier command looked equivalent.
- Updating a checked-out branch or using `reset --hard` on the user's worktree:
  it is not atomic and can endanger unrelated changes.
- OS-global temporary roots or persistent environment variables: they violate
  repository ownership and make Windows cleanup/command surfaces harder to
  audit.
- Replacing native hostile, lineage, source-proof, architecture, contract, or
  production-equivalence checks: orchestration may reuse exact evidence but
  cannot redefine the checks.

## Consequences

Strict-gate performance now depends on complete cache input declarations;
incomplete declarations fail before caching instead of silently broadening
reuse. A content digest proves identity, not authorship, so authorization stays
in committed files protected by the repository and is included in every
binding. Detached template worktrees remain reusable but clean; hostile case
worktrees are removed after each command. The ordinary `verify --strict` path
and all existing assertions remain unchanged.
