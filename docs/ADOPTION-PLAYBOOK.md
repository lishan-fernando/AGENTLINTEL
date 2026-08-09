# Adoption Playbook

Goal: first verified PR in about 30 minutes, then tighten rules as the repo
proves its shape.

## Start

```bash
npm i -D @agentlintel/cli@alpha
npx agentlintel init
npx agentlintel verify
```

Use the GitHub Release tarball only when you need an exact pinned artifact or a
registry-free fallback:

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.14/agentlintel-cli.tgz
```

Choose a pattern only when the default vertical-slice rules do not fit:

```bash
npx agentlintel init --pattern layered-3tier
npx agentlintel init --pattern mvvm
npx agentlintel init --pattern custom
```

Use `--from-v1` only for an existing v1 or `.ai-governance` layout. The
migrator keeps derivable checks, marks the rest `pending`, and writes
`.agentlintel/MIGRATION.md`.

## First PR Checklist

- Fill `facts.yaml` with paths/commands the machine can check.
- Register one real exemplar in `exemplars.yaml`.
- Replace the starter `**/*` guard zone with the smallest writable paths.
- Delete starter rules that do not apply.
- Keep `must_match: false` only for deliberate future-carrier rules; flip to
  `true` once matching paths exist.
- Wire CI with the exact-version Action, or run
  `agentlintel verify --strict --base <target-sha>` with the actual PR base.
- Check out full history (`fetch-depth: 0` in GitHub Actions); the CLI never
  fetches a missing comparison ref.
- Protect `AGENTS.md`, `.agentlintel/**`, `.agents/skills/**`, and the gate
  workflow with CODEOWNERS and required code-owner review. ADRs provide
  rationale, not authenticated approval.
- Protect every `engine: external` checker entrypoint, its config, and its
  dependency lockfile with the same required review.
- Add `init --hooks` only after local verify is green.

## Brownfield Rollout

1. Run an intentionally incomplete advisory pass:
   `verify --no-run --skip-fixtures`.
2. Fix stale facts and missing exemplars.
3. Turn on fixtures and project-native external engines before treating deep
   architecture claims as blockers.
4. For built-in file rules with existing debt, set `enforcement: no-new`.
   AgentLintel derives the legacy set from the target Git commit; do not create
   or maintain a violation snapshot file.
5. Turn warnings and introduced violations into blockers with a full trusted
   `verify --strict --base <target-sha>` run; strict rejects skipped work.
6. Use bounded exemptions only for reviewed exceptions—not as a bulk legacy
   baseline:
   `Reason`, `Approver`, `Expires`, `Owner`.

## Native Engines

Use `init --engine-adapters` when regex is too weak. For semantic or
AST-aware rules, start here instead of stretching a regex. Typical mappings:

- Frontend public surfaces: dependency-cruiser -> `engine: external`.
- .NET architecture tests: `dotnet test` -> `adapter: dotnet-test`.
- Compiler/analyzer findings: SARIF 2.1 -> `adapter: sarif`.
- Custom tools: JSONL findings `{file,line,message}` on stdout.

Each external rule still needs fixtures. Fixtures validate output mapping; live
engines run during tree verify unless `--no-run` or `--diff` is used. Both
flags make the run incomplete under `--strict`. The built-in `layers` engine
checks JS/TS imports only; native-language boundaries need an external native
checker.

## C# Code Quality

Run `init --engine-adapters`, import
`.agentlintel/adapters/dotnet-code-quality.props` from `Directory.Build.props`,
and copy/tune the `dotnet.code-quality` rule. The generated runner asks the C#
compiler for SARIF 2.1 in a temporary directory, merges project reports, and
returns repository-relative file, line, column, diagnostic id, and message.
It does not add analyzers or mutate source.

This follows Microsoft's documented [analyzer configuration](https://learn.microsoft.com/dotnet/fundamentals/code-analysis/configuration-files),
[compiler ErrorLog SARIF](https://learn.microsoft.com/dotnet/csharp/language-reference/compiler-options/errors-warnings#errorlog),
and [file-scoped namespace](https://learn.microsoft.com/dotnet/fundamentals/code-analysis/style-rules/ide0160-ide0161)
contracts instead of inventing parallel syntax rules.

Use the narrowest authority for each policy:

- Compiler, .editorconfig, and Microsoft analyzers: file-scoped namespaces,
  formatting/imports, unnecessary qualification, visible nested types,
  sealable internal types, async API use, and cancellation forwarding.
- A pinned Roslyn/custom analyzer: no nested production types (including
  private; private test fixtures may be exempt), one top-level type per file,
  filename/type agreement, forbidden service location, sync-over-async, dead
  public members, and repository-specific source shapes.
- Architecture tests: thin adapters, explicit constructor dependencies, live DI
  composition, no registration-time I/O, dependency direction, justified ports,
  aggregate state encapsulation, error-catalog placement, and public contract
  placement.
- Behavioral/contract tests: validate before normalize, expected-error mapping,
  idempotency, cancellation behavior, API/message versioning, and
  composition-root startup.
- Human review: naming and linear readability, comments only for non-obvious
  intent, SRP/OCP/LSP/ISP/DIP judgment, speculative abstractions, and complexity
  that has no honest universal numeric threshold.

CA1034 only rejects externally visible nested types; it does not prove a strict
"no nested production type" policy. Keep that stricter policy in a native
analyzer or architecture test instead of stretching AgentLintel regex.

## Multi-Repo

Put governance inside each repo. Use `agentlintel.workspace.yaml` only to list
members for fan-out:

```yaml
members:
  - app-api
  - app-web
```

Run `agentlintel verify --workspace` from the workspace root. Each member must
be a real Git repository top-level.

## Claim Boundary

Say: "AgentLintel gives AI-agent repos a deterministic architecture gate."
Also say: "Built-in rules are a portable floor; deep checks should use
project-native tools through `engine: external`."
Do not claim proven causal impact until the benchmark protocol has produced
public results.
