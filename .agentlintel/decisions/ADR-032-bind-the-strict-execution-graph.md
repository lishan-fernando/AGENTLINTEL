# ADR-032: Bind the strict execution graph

Accepted: 2026-09-21

## Context

ADR-031 binds strict-gate inputs, results, and timings, but its plan leaves the
deduplication graph implicit in command order. A performance investigation must
show which restore, build, contract, Git-proof, architecture, final-gate, and
clean-checkout operations are declared, repeated, and actually executed.
Reconstructing that graph after verification is weaker than binding it before
work begins.

Decision:

1. Prepare derives and binds an execution graph from the normalized JSON
   contract. It records ordered stage barriers, command nodes, operation
   categories, equivalence groups, canonical executions, and clean-checkout
   requirements.
2. Verify derives the graph again and rejects any mismatch, even when an
   attacker recomputes the plan's outer content digest.
3. The verification bundle records the actual worker count, heartbeat interval,
   workspace strategy, and per-command workspace mode. Parallel commands use
   isolated owned worktrees; the one-worker path reuses the clean template.
4. Rebaseline the measured caps for this bound graph and its public-CLI journey:
   836,000 versionable bytes, 489,000 eligible movable bytes, and 360,000 npm
   unpacked bytes. Each cap retains less than one percent headroom.

## Rejected

- Inferring duplicates only from elapsed timings: cache hits, failures, and
  short commands make that ambiguous.
- Sharing one checkout between parallel workers: command outputs can race and
  invalidate both correctness and timing evidence.
- A separate hand-maintained profile file: it would mirror the executable JSON
  plan and violate the verified-or-deleted law.

## Consequences

Plans are slightly larger but directly explain the strict execution topology.
Graph tampering fails before any command runs. Existing final-gate, hostile,
lineage, source-proof, architecture, and contract assertions are unchanged.
