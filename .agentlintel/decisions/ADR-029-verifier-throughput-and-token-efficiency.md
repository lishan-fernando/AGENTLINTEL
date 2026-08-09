# ADR-029: Verifier Throughput and Token-Efficiency Program

Accepted: 2026-07-28

## Context

An evidence audit of the framework (baseline: `verify` 4.16s full / 2.03s
diff, `npm test` 73.4s for 187 tests, always-load ~1.1K of the 2K token
budget) found three throughput drags and two token leaks:

- untracked-governance detection walked the entire tree on every run even
  though only governance roots can carry governance artifacts;
- every per-file safety check re-resolved the repository root realpath and
  re-`lstat`ed the file, multiplying syscalls by file count;
- git state (inventory, fingerprints, changed files, blob reads) is
  re-queried in overlapping subprocesses with no shared snapshot;
- `--json` pretty-printed its result graph (~2.3K tokens per clean run),
  which is pure cost for the machines that consume it;
- `verify.js` sat at 3,196 of its 3,200-line ceiling, so any orchestration
  change failed its own fact before design discussion could even start.

Decision:

1. Untracked-governance detection scans only governance roots
   (`.agentlintel/`, `.agents/skills/`, root instruction files) on the
   filesystem. The scan stays filesystem-based so ignored governance
   artifacts are still caught masquerading as committed policy.
2. Repository-root realpaths are memoized per process; evidence files are
   still resolved on every call, because their symlink state is the property
   under check. The duplicate `lstat` in the safe-path chain is removed.
3. `--json` emits compact single-line JSON. Human-readable output remains
   the default renderers' job.
4. Path-safety helpers move to `lib/safe-paths.js`; overlapping git state
   queries consolidate behind one per-run snapshot in the same program.
5. Test-suite throughput comes from shared hermetic fixtures and honest
   file-level concurrency; coverage and fixtures remain the contract.
6. The tracked, eligible, and package byte budgets are rebaselined to
   measured values as the program lands, with the final caps carrying under
   one percent headroom.

## Rejected

- an async or worker-thread rewrite of CLI I/O, because the process is
  short-lived and the wins are call-count reductions, not event-loop overlap;
- a checked-in violation or byte snapshot, restating ADR-028's prohibition on
  hand-maintained mirrors of code state;
- keeping pretty JSON behind a compatibility flag, because a second output
  mode is concept creep and formatters already exist (`jq`);
- raising the `verify.js` line ceiling instead of extracting focused modules.

## Consequences

- The full gate measures ~1.4s on the framework tree after extraction, down
  from 4.16s; the diff loop stays under 2s.
- `--json` consumers pay roughly one third of the previous token cost;
  agents should default to `--quiet` and humans to `report`.
- Byte budgets rebaseline from 717,000 / 407,000 / 287,000 to the measured
  values recorded alongside each milestone commit of this program.
- Path safety keeps its fail-closed semantics: memoization covers only the
  invariant root, never the evidence under evaluation.
