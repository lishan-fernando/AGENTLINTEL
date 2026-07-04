# ADR-007: Close the enforcement gaps found in production (v2.1)

Date: 2026-07-02
Status: Accepted
Informed by: docs/PRODUCTION-FEEDBACK-2026-07.md (GG + POS production study,
adversarially reviewed by five independent verification passes)

## Context

Both production deployments (GG and POS, v1) validated the framework's
content — exemplar mirroring, verified facts, guard zones, ADRs — and exposed
the same failure: nothing the framework ships enforces anything automatically.
v2 itself had four broken mechanisms: exemptions audited but never suppressed,
guard diffed HEAD (a no-op after CI checkout), init scaffolded rules without
their fixtures (7 immediate LAW VIOLATIONS), and the framework's own budgets
("≤150 lines", "≤2K tokens") had no check types to enforce them. Both
deployments are colocated multi-repo workspaces with governance outside git —
a shape v2 could not verify at all.

## Decisions

1. **Exemption suppression is a verify-level cross-pass, not an engine.** A
   valid marker (all fields, unexpired) suppresses the named rule from the
   marker line through the last field line + `within_lines`. Suppressed
   violations stay in JSON output tagged `exempted: true` — counted, never
   hidden (ratchet-ready). `exemption.audited` is never suppressible.
2. **Guard learns `--base <ref>`**, auto-detects `GITHUB_BASE_REF`, fetches
   shallowly when needed, and reports explicitly when no base resolves. Base
   refs are validated against a safe-character set before hitting the shell.
3. **Empty-match detection** (`must_match: true|unset|false` = error | warning
   | declared fixture-carrier). The dead `examples` guard zone this feature
   found on its first run in this repo was deleted the same day.
4. **New fact check types**: `line_count_max`, `byte_count_max`, `file_absent`,
   `glob_count`, `pending`. Token budgets are enforced as byte budgets
   (~4 bytes/token) — an honest ceiling instead of a fake tokenizer; the
   alternative (a tokenizer dependency) was rejected to keep the single-dep CLI.
   `pending` exists so migrations can be honest: verify warns, never fake-greens.
5. **init ships fixtures and skills** (green out of the box). The CLI templates
   for both are a machine-verified mirror of the kernel copies — a sync test
   fails when they diverge (verified mirrors are legal; hand-maintained ones
   are not).
6. **`init --from-v1`** migrates v1/`.ai-governance` layouts: derivable claims
   become checked facts, the rest become `pending`, guard zones map across,
   `forbiddenImports` and other unmappables are listed in MIGRATION.md rather
   than silently dropped.
7. **Workspace mode**: `agentlintel.workspace.yaml` + `verify --workspace`.
   Classified as CLI scope configuration (like `--dir`), not a seventh concept.
   Members are machine-verified every run; empty membership fails; init warns
   hard when governance is not in a git repository.
8. **Hook mode**: `verify --diff --quiet --bail` plus a wrapper emitted by
   `init --hooks` that maps CLI exit 1 to the agent-hook protocol's blocking
   exit 2. The CLI's documented exit codes (0/1/2) are unchanged.
9. **`engine: external`**: tree-scoped commands emitting JSONL
   `{file,line,message}`, reporting under AgentLintel rule ids; fixtures cover
   the output-mapping contract via recorded `output.jsonl`. This is the
   "build on, never build" path to dependency-cruiser / ast-grep / compiled
   architecture tests (POS hand-built exactly this; now it has a socket).
10. **Adapters are content-free pointers** (`init --adapters` for Cursor /
    Copilot / Windsurf) on the CLAUDE.md precedent; verify fails an adapter
    that grows content. They are not compile targets — there is nothing to
    compile.
11. **Conformance directories are skipped by tree rule runs wherever they
    live** — fixtures are deliberate violations, the rule's contract, not the
    codebase.
12. **The GitHub Action runs the CLI from its own checkout**, so the gate works
    before any npm publish; `no_run` input exists because command facts execute
    YAML-declared shell and untrusted fork PRs must not gain CI code execution.

## Consequences

- `init && verify` passes out of the box; the 30-minute adoption target is
  mechanically possible.
- The two stranded v1 production workspaces (GG, POS) have a migration path and
  a workspace-aware gate — they are the intended first case study.
- The CLI grows from ~750 to ~1,300 lines, still plain Node, one dependency,
  three commands. Rejected: new CLI verbs (migrate/status/context) — folded
  into init/report flags to keep "init, verify, report — nothing else" true.
- Deferred, per the study: generated per-slice AGENTS.md (needs an ADR
  narrowing the no-compilation law), emitting ESLint/dependency-cruiser configs
  from rules.yaml, exemption-count ratchet baselines, versioned rule-pack
  upgrade channel.
