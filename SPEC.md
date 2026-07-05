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
.agentlintel/skills/<name>/SKILL.md
.agentlintel/decisions/ADR-*.md
.agentlintel/conformance/<rule-id>/cases/<case>/
```

## Facts

`facts.yaml` stores checked claims. `verify` reruns each check; stale facts fail
the gate unless the check is `pending`, which warns.

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
- `glob_count`
- `command`
- `pending`

Run untrusted PRs with `--no-run`; command facts execute shell.

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
    applies_to: ["**/*.ts"]
    forbidden: ["from\\s+['\"](?:\\.\\./)*slices/[^/'\"]+/(domain|application)\\b"]
    message: "Import from the slice public surface."
```

Engines:

- `regex`: line-scoped forbidden regexes.
- `error-codes`: validates `<SLICE>-<CATEGORY>-<NUMBER>` literals.
- `exemptions`: audits `AGENTLINTEL-EXEMPT` metadata and expiry.
- `layers`: declarative architecture boundaries using layer path globs and an
  `allowed` dependency map.
- `external`: runs a repo command. Default output is JSONL `{file,line,message}`;
  adapters exist for `command-status`, dependency-cruiser, and `dotnet test`.
  This is the primary language-agnostic path for native architecture tests and
  other deep analyzers.

```yaml
rules:
  - id: architecture.contract
    severity: error
    engine: external
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

Rule-set ratchet: deleting, weakening, narrowing, excluding, downgrading,
changing engine/command, or expanding layer dependencies requires an
`.agentlintel/decisions/ADR-*.md` in the same diff.

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
test. External-rule fixtures validate recorded output mapping, not live engine
execution.

## Guard

`guard.json` defines allowed write zones and forbidden globs. `verify` checks
changed and untracked files. In CI pass `--base <ref>`; GitHub PRs also use
`GITHUB_BASE_REF` when available. If the base cannot be resolved, verify warns,
and `--strict` fails.

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
```

Complete, unexpired markers suppress the named rule within the configured span
but stay visible as `exempted` in JSON. Invalid or expired markers suppress
nothing. `exemption.audited` cannot be suppressed.

## CLI

```text
agentlintel init
agentlintel verify
agentlintel report
```

Init flags: `--pattern`, `--from-v1`, `--adapters`, `--hooks`,
`--engine-adapters`, `--force`.

Verify/report flags: `--dir`, `--base`, `--diff`, `--quiet`, `--bail`,
`--workspace`, `--json`, `--strict`, `--no-run`, `--skip-fixtures`.

Exit codes: `0` passed, `1` gate failed, `2` internal/config error.

Fast agent loop: `verify --diff --quiet --bail --no-run --skip-fixtures`.
Merge gate: `verify --strict`; CI must run this on every PR before merge.

## Workspaces

`agentlintel.workspace.yaml` is scope configuration, not a concept:

```yaml
members:
  - app-api
  - app-web
```

`verify --workspace` checks each member exists, is a git repo, has its own
kernel, and then aggregates member results.

## Skills

Reference skills:

- `strangler-extraction`
- `mirror-exemplar`
- `audit-architecture`

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
