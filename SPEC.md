# AgentLintel v2 Specification

AgentLintel is a deterministic architecture gate for AI-agent codebases. It is
metadata plus a CLI, not a runtime.

## Laws

1. Verified, append-only, or deleted.
2. A rule exists only if a machine can fail a PR over it.
3. Six concepts: facts, rules, guard, exemplars, skills, decisions.
4. Ride standards: `AGENTS.md` and `SKILL.md`.
5. Always-load stays under about 2K tokens.

## Files

```text
AGENTS.md
CLAUDE.md
.agentlintel/facts.yaml
.agentlintel/rules.yaml
.agentlintel/guard.json
.agentlintel/exemplars.yaml
.agents/skills/<name>/SKILL.md
.agentlintel/decisions/ADR-*.md
.agentlintel/conformance/<rule-id>/cases/<case>/
```

`CLAUDE.md` is the one-line `@AGENTS.md` compatibility import, not a second
instruction source.

## Facts

`facts.yaml` stores checked claims. `verify` reruns each check; stale facts fail
the gate unless the check is `pending`, which requires a note and warns.

```yaml
version: 2
facts:
  - id: result-primitive
    claim: "Result lives in shared/Result.ts"
    check: { type: path_exists, path: shared/Result.ts }
```

Check types:

- `path_exists`
- `file_absent`
- `file_contains`
- `line_count_max`
- `byte_count_max`
- `frontmatter_byte_count_max`
- `glob_count`
- `command`
- `pending`

Run untrusted PRs with `--no-run`; command facts execute shell. Executable
checks run only from a committed Git snapshot, and changing versionable state
during the gate is an error. YAML aliases are rejected in governance and
fixture files so the contract stays a finite, acyclic data structure.

## Rules

`rules.yaml` stores the executable architecture contract. It can use built-in
engines or repo-native external checkers. Every active rule needs fixtures under
`.agentlintel/conformance/<rule-id>/cases/`.

The gate verdict is deterministic; the detection depth depends on the engine.
Built-in engines are portable syntactic checks. Use `external` for semantic,
AST-aware, type-aware, or stack-native architecture checks.

```yaml
version: 2
rules:
  - id: slice.no-deep-imports
    severity: error
    engine: regex
    adr: ADR-007
    applies_to: ["**/*.ts"]
    forbidden: ["from\\s+['\"](?:\\.\\./)*slices/[^/'\"]+/(domain|application)\\b"]
    message: "Import from the slice public surface."
```

Optional `adr` provenance prints the accepted decision beside violations. It
explains why a rule exists; it does not compile decisions into rules.

Engines:

- `regex`: glob-scoped forbidden regexes plus optional positive `required`
  evidence. Matching is line-scoped by default; `match: file` enables bounded
  multi-line structural checks. Every required pattern must appear at least
  once across the rule's effective file scope during a full-tree gate. Optional
  `when` patterns activate positive requirements only after any trigger appears,
  so feature contracts can stay green before the feature exists. Once a trigger
  matched the Git baseline it is sticky; deleting it fails instead of silently
  deactivating the rule. Diff mode skips absence claims and remains incomplete.
- `error-codes`: validates `<SLICE>-<CATEGORY>-<NUMBER>` literals.
- `exemptions`: audits `AGENTLINTEL-EXEMPT` metadata and expiry.
- `layers`: JS/TS import boundaries using layer path globs and an `allowed`
  dependency map. Overlapping layer coverage fails; native languages use an
  external architecture checker.
- `external`: runs a repo command. Default output is JSONL `{file,line,message}`;
  adapters exist for `command-status`, dependency-cruiser, and `dotnet test`.
  This is the primary language-agnostic path for native architecture tests and
  other deep analyzers. `evidence` names exact, regular repository files that
  implement/configure the checker; changing them is a contract weakening.

```yaml
rules:
  - id: cancellation.complete-surfaces
    severity: error
    engine: regex
    applies_to: ["src/Ordering/**", "src/WebApp/**"]
    match: file
    when: ["CancellationPending"]
    required:
      - "CancellationReason"
      - "CancellationRequestedAt"
    forbidden:
      - "CancellationPending[\\s\\S]{0,400}SetCancelledStatus\\("
    message: "Cancellation must remain pending and reach its read surfaces."

  - id: architecture.contract
    severity: error
    engine: external
    evidence: [package.json, package-lock.json]
    adapter: command-status
    scope: tree
    run: "npm run architecture:check"
    message: "Repository architecture contract must pass."
```

`command-status` maps exit 0 to pass and exit 1 to a rule violation; other
exits are engine failures unless listed in `ok_exits`. Optional `scope` values
are `tree`, `commit`, or `pr`, so commit and PR policies are ordinary rules.

Empty scope handling: `must_match: true` fails, unset warns, and
`must_match: false` declares a scaffold/future-carrier rule.
Governance evidence must be regular, tracked, in-repository files. Ignored or
untracked governance cannot establish a Git-backed strict verdict. A governed
or global scope that reaches an opaque symlink or gitlink directory fails
unless that subtree is explicitly excluded; an exact file exclusion does not
waive an opaque directory. Govern each submodule as a workspace member or with
an external checker.

Contract ratchets require a newly added `.agentlintel/decisions/ADR-*.md` when
an existing fact claim/check or exemplar is weakened, removed, or relabeled;
a registered exemplar implementation or external-checker evidence changes; a
rule is weakened; or the write guard is broadened. Each finding needs an exact
one-line `Authorizes-Weakening` JSON record naming `artifact` and `finding` in
the new ADR; an unrelated ADR authorizes nothing. Additions and monotonic
tightening are free. Existing ADR files are immutable; a new ADR needs a real
accepted date no later than today plus a concrete `Decision:` section. ADRs
record provenance and rationale, not authenticated human approval.

Reference rules: `slice.no-deep-imports`, `domain.purity`,
`identity.no-auth-import`, `secrets.no-logging`, `boundary.validation`,
`error-code.format`, `exemption.audited`.

Pattern packs are rule presets selected by `init --pattern`: `vertical-slice`,
`layered-3tier`, `mvvm`, or `custom`.

## Fixtures

Each fixture case is a tiny source tree plus `expected.yaml`:

```yaml
violations:
  - rule: slice.no-deep-imports
    file: slices/Workflow/interface/handler.ts
    line: 3
    message_contains: "Import from"
```

`violations: []` means the case must produce no violations for the rule under
test. Every rule requires at least one explicit passing case and one failing
case. File-engine cases contain a file in the declared scope; external cases
record `status.txt`. External fixtures validate recorded output mapping, not a
live engine execution.

## Guard

`guard.json` defines allowed write zones and forbidden globs. `verify` checks
changed and untracked files. In CI pass the actual target/PR commit as
`--base <sha>` and check out full history; the commit must already exist
locally because the CLI never fetches. If the base cannot be resolved, verify
warns, and `--strict` fails.

```json
{
  "version": 2,
  "zones": [{ "id": "app", "allow": ["src/**"] }],
  "forbidden": ["**/node_modules/**"]
}
```

## Exemplars

`exemplars.yaml` registers canonical code that agents mirror:

```yaml
version: 2
exemplars:
  - id: capability
    shape: crud
    path: slices/Capability
    demonstrates: "Public surface, Result, validation, tests"
```

If no exemplar matches, the agent should stop and ask for one.

## Exemptions

```text
AGENTLINTEL-EXEMPT: <rule-id>
Reason: <why>
Approver: <who>
Expires: <YYYY-MM-DD>
Owner: <team>
Decision: ADR-<number>
```

Complete, unexpired markers suppress the named rule only when the named ADR has
an exact `Authorizes-Exemption` JSON record for `rule`, `file`, and `expires`.
Suppressed findings stay visible as `exempted` in JSON. Invalid, expired, or
unauthorized markers suppress nothing. `Approver` is audit metadata, not an
authentication mechanism.
`exemption.audited` cannot be suppressed.

## CLI

```text
agentlintel init
agentlintel verify
agentlintel report
agentlintel explain --path <file>
agentlintel explain --path <file> --shape <shape> --compact
```

Init flags: `--pattern`, `--from-v1`, `--adapters`, `--hooks`,
`--engine-adapters`, `--force`.

Verify/report flags: `--dir`, `--base`, `--diff`, `--quiet`, `--bail`,
`--workspace`, `--json`, `--strict`, `--no-run`, `--skip-fixtures`,
`--mode warn`.

Explain flags: `--dir`, `--path`, `--json`.

Exit codes: `0` passed, `1` gate findings, `2` invalid invocation or internal
error.

Fast agent loop: `verify --diff --quiet --bail --no-run --skip-fixtures`.
Merge gate: `verify --strict --base <target-sha>`; CI must run this on every PR
before merge. Strict mode rejects a missing comparison base and any skipped
fixtures, diff-only scan, command fact, or external engine.
Adoption ramp: `verify --mode warn` reports findings without failing.

In Git, run `verify` from the repository top-level. A nested directory is not
a separate verification root.

## Workspaces

`agentlintel.workspace.yaml` is scope configuration, not a concept:

```yaml
members:
  - app-api
  - app-web
```

`verify --workspace` checks each member exists, is a real Git repository
top-level, has its own kernel, and then aggregates member results.

## Skills

Reference skills:

- `strangler-extraction`
- `mirror-exemplar`
- `audit-architecture`
- `scope-change`
- `prove-stateful-workflow`

They are normal Agent Skills and load only when invoked.

## Five Architecture Rules

1. A slice is one business capability.
2. One public file per slice; internals stay private.
3. `Result<T,E>` for expected business failures; throw for bugs.
4. Validate untrusted input at each boundary.
5. Error codes are stable and slice-local.

## Non-Goals

No orchestration, instruction compilation, token metering, maturity
certification, or non-enforceable rules.
