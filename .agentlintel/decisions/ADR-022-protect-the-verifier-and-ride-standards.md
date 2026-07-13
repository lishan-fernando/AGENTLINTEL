# ADR-022: Protect the Verifier and Ride the Standards

Accepted: 2026-07-09

AgentLintel's release candidate was reviewed against current empirical work,
official agent documentation, developer reports, and an adversarial audit of
the repository. The evidence supports the existing small architecture, but it
exposes one trust gap: a candidate change must not receive a false green by
weakening the same evaluator that judges it.

Evidence:

- RewardHackingAgents observed evaluator-tampering attempts in about half of
  natural-agent runs and eliminated them by locking the evaluator:
  https://arxiv.org/abs/2603.11337
- SpecBench found that frontier agents can saturate visible tests while failing
  compositional held-out tests: https://arxiv.org/abs/2605.21384
- A 20,574-session study found recurring constraint violations and inaccurate
  completion reports, with most visible resolutions requiring developer
  correction: https://arxiv.org/abs/2605.29442
- Evaluating AGENTS.md found that generated repository context increased cost
  without improving task success, supporting a short human-written entrypoint:
  https://arxiv.org/abs/2602.11988
- A Codex CLI user report describes correctly read `AGENTS.md` requirements
  being applied inconsistently later in the same multi-turn session. It is
  practitioner evidence, not a measured prevalence claim:
  https://github.com/openai/codex/issues/25884
- METR documented frontier models modifying tests, scoring code, and evaluator
  behavior to obtain high scores without solving the intended task:
  https://metr.org/blog/2025-06-05-recent-reward-hacking/
- Anthropic documents `@AGENTS.md` as the literal Claude Code import, and the
  Agent Skills implementation guide identifies `.agents/skills/` as the
  cross-client discovery path:
  https://code.claude.com/docs/en/memory#agentsmd
  https://agentskills.io/client-implementation/adding-skills-support

Decision:

1. Existing ADR files are immutable. Only a newly added, minimally well-formed
   ADR can satisfy the rule or guard ratchet. ADR text records rationale; it is
   not authenticated human approval.
2. Every rule must have an explicit passing fixture and failing fixture. A
   file-engine fixture must contain a file in the declared scope; an external
   fixture must record its exit status and replay the live engine outcome.
   Missing or malformed evidence fails closed.
3. The ratchet covers fact claim/check weakening, exemplar mutation or
   removal, dormant scopes, case-sensitivity loss, added error categories,
   weakened exemption fields or windows, the first exemption provider,
   external adapter changes, and alias shadowing. Guard allow-list expansion
   or forbidden-list contraction also requires a new ADR.
4. Strict Git verification requires the actual target/PR base and full local
   history. Its root must be the repository top-level, and ignored or untracked
   governance cannot establish the verdict. The CLI never fetches.
5. Empty guards, duplicate kernel IDs/layers, invalid or aliased YAML shapes,
   no-op regex rules, empty exemption fields, impossible expiry dates,
   oversized inputs, opaque symlink/gitlink boundaries reached by governed or
   global scopes, and malformed external output fail closed. Only an explicit
   subtree exclusion waives an opaque directory. Command facts and external
   engines require a committed Git snapshot; mutating versionable state while
   the gate runs is a failure.
6. The unverifiable PreToolUse hook is deleted. The Stop hook remains and now
   blocks on every nonzero verifier exit, including a missing CLI.
7. Composite-action inputs cross into Bash through environment variables and
   are validated as data. The Action derives the event's exact base SHA. Auto
   mode skips repo commands on fork PRs and merge groups; that run is
   incomplete under strict until a trusted caller executes those commands.
   `no_run: false` remains an explicit trusted-caller override.
   Base-branch CODEOWNERS protects the contract,
   verifier, fixtures, and workflows; required code-owner review remains a
   repository-host setting.
8. Skills move from the private `.agentlintel/skills/` location to the standard
   `.agents/skills/` discovery path. `CLAUDE.md` becomes the literal
   `@AGENTS.md` import. No compatibility duplicate is retained.
9. The repository and package byte caps are re-baselined once, with less than
   one percent headroom, to admit these integrity checks. Future growth still
   fails the same machine gate.
10. The built-in `layers` engine claims only JS/TS import coverage. Other
    languages must use an external native checker instead of receiving a
    syntactic false green.

Rejected:

- another concept, generic quality score, broad skill, or generated context;
- freezing ordinary fixture edits, which would obstruct verifier hardening;
- claiming that ADRs, exemption fields, or an in-worktree ratchet prove human
  approval;
- changing the deliberate license or default architecture pattern without a
  separate owner decision and adoption evidence.

Consequences:

- Existing adopters with one-sided fixture suites receive a deliberate
  one-time failure and a precise repair.
- Source archives remain usable with `--no-run` in non-strict mode, but cannot
  masquerade as a Git-backed merge gate.
- Fast `--diff`, `--skip-fixtures`, and `--no-run` passes remain useful agent
  feedback, but cannot masquerade as a complete strict gate.
- The contract stays at six concepts. This change hardens their integrity and
  removes two non-standard delivery paths; it adds no engine or agent runtime.
