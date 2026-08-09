# ADR-028: SARIF bridge for native analyzer findings

Accepted: 2026-08-09

## Context

AgentLintel deliberately keeps built-in engines dependency-free and syntactic.
ADRs 008, 014, 022, and 024 route C#, Java, and other type-aware checks through
`engine: external`, but the existing .NET starter collapses an architecture test
run into one `(dotnet-test)` finding. That is adequate for a merge gate and poor
for an agent repairing source one file at a time. Adding a hand-written C# parser
would contradict the established boundary and duplicate Roslyn badly.

The C# compiler and analyzers already emit Static Analysis Results Interchange
Format (SARIF) with diagnostic identity and physical source locations. The
framework needs to preserve that evidence rather than reinterpret C#.

Decision:

1. Add `sarif` to the existing external-engine adapter contract. Accept SARIF
   2.1.0, map each result to the AgentLintel rule id, retain diagnostic id, file,
   line, and column, and fail closed on malformed output.
2. Ship an Apache-2.0 `dotnet-sarif.js` starter through
   `init --engine-adapters`. It invokes a caller-selected `dotnet build`, owns
   per-project compiler `ErrorLog` files under a fresh OS temporary directory,
   merges them, normalizes in-repository locations, and deletes only that
   directory. Diagnostics exit 1; missing tools, timeouts, malformed logs, and
   command failures without diagnostic evidence exit 2.
3. Ship an opt-in MSBuild props/globalconfig starter for Microsoft analyzers and
   build-time code-style enforcement. It is configuration, not a C# parser and
   not a claim that Microsoft analyzers enforce every repository policy.
4. Keep strict source-shape rules such as no private nested production types,
   one type per file, filename/type agreement, and service-location bans in a
   pinned Roslyn/custom analyzer. Keep DI graph, aggregate, boundary, and SOLID
   contracts in project-native architecture and behavioral tests. AgentLintel
   owns their rule id, evidence ratchet, fixtures, reporting, and CI verdict.
5. Register the generated .NET runner as the external-adapter exemplar. Cover
   SARIF parsing, fail-closed behavior, path normalization, starter copying, and
   passing/failing recorded fixtures before release.
6. Rebaseline the frozen repository and movable-payload byte budgets once to
   admit the adapter, its tests, fixtures, and adoption guidance. The exact caps
   are 719,000 tracked bytes, 410,000 eligible movable bytes, and 291,000 npm
   unpacked bytes: each is the measured normalized size plus less than one
   percent headroom. Always-load budgets and the one-dependency limit do not
   change.

## Rejected

- A built-in C# tokenizer or parser: it conflicts with the native-engine
  boundary, adds false semantic confidence, and becomes a second compiler.
- Regex rules for C# declarations: comments, strings, attributes, records,
  generated code, and partial types make a green result misleading.
- Only enriching `dotnet-test` console parsing: test output still points to the
  fitness test rather than each offending production source location.
- Writing SARIF into the repository: executable verification must not mutate
  versionable state or leave stale evidence that can masquerade as a current run.

## Consequences

Native analyzers can now guide file-by-file repairs through exact locations
without expanding AgentLintel's concept count, command set, runtime dependency
set, or language claims. Adopters must restore their toolchain before the
`--no-restore` starter command and protect analyzer projects, configuration, and
lockfiles as external-rule evidence. `--no-run` and `--diff` remain incomplete
under strict verification.
