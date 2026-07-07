# ADR-016: Adopt Mneme Lessons Without Kernel Regression

Accepted: 2026-07-06

A primary-source comparison against Mneme HQ (mnemehq.com; MIT; single
maintainer; deterministic keyword/term matching over one `project_memory.json`)
was run to decide what, if anything, AgentLintel should borrow. It produced an
initial "adopt from Mneme" list that was **largely stale against AgentLintel v2**:
most items proposed capabilities the CLI already ships, and one (export rules into
Cursor files) would have regressed the anti-drift kernel. Grounding each claim in
the code rather than the pitch is the point of this ADR, so reviewers do not
re-propose what exists.

Already shipped - do not re-propose (verified against the CLI):

- In-agent-loop enforcement. `init --hooks` installs a Claude Code `Stop` hook that
  runs `verify --diff --quiet --bail --no-run --skip-fixtures`
  (`templates/hooks/verify-hook.sh`). AgentLintel is not "CI-only."
- Warning semantics. `verify` carries a per-rule severity ladder
  (`off`/`info`/`warn`/`error`): `warn` findings report without failing, and
  `--strict` escalates them to failures (`src/lib/verify.js`). AgentLintel is not
  "fail-only."
- Editor surfaces. `init --adapters` generates Cursor/Windsurf/Copilot pointer
  files; `--engine-adapters` wires external engines (e.g. dependency-cruiser for
  JS/TS, `github-pr-policy`, `commit-message-policy`).
- Decision governance. Weakening a rule or downgrading its severity fails the gate
  unless an `ADR-*.md` lands in the same diff.

The real gap is narrower: Mneme tells a sharper *before-write* and
*product-surface/positioning* story, while AgentLintel holds the stronger
fixture-backed enforcement kernel. The direction is to close that gap without
touching the enforcement substrate.

Decision - new work, in priority order:

1. `agentlintel explain --path <file>`: print which rules, guard zones, exemplars,
   and decisions apply to a path, and why. Deterministic authoring/debugging help -
   not a new enforcement path; enforcement stays exhaustive over the diff.
2. Global advisory run, e.g. `verify --mode warn`: downgrade *all* findings to
   non-failing for an adoption ramp on an existing repo. This is distinct from
   today's per-rule `severity: warn`; CI still uses `--strict` once the team
   commits to enforcement.
3. Before-write hook variant: add a Claude Code `PreToolUse` surface that blocks a
   violating Edit/Write/MultiEdit at the write seam, alongside the existing `Stop`
   hook. `Stop` gates at end-of-turn (quieter, catches at "done"); `PreToolUse`
   catches per-write (earlier, more interruptive). Ship both and let adopters
   choose; do not replace `Stop`.
4. Optional rule provenance: allow `adr: ADR-007` on a rule and print it with the
   violation, so a failure explains not just *what* fired but *which accepted
   decision* justifies it. Complements the existing ADR-gating of rule changes.
5. Positioning: state the moat plainly - fixture-backed, deterministic architecture
   gates plus external engines for deep native checks - and do not concede the
   category to prompt-file, memory, or retrieval tooling. Borrow Mneme's messaging
   clarity, never its mechanism.

Non-decisions (the "without kernel regression" line):

- The v2 kernel concepts - facts, rules, guard, exemplars, skills, decisions -
  stay. No single `project_memory.json`-style memory blob.
- No text/keyword matching as the core enforcement model. Built-in syntactic
  engines are a portable floor; deep checks go through `engine: external` (or
  future deterministic engines), always with conformance fixtures before a rule can
  fail a PR.
- No ADR-to-rule *compilation* as the source of truth. An importer or draft-rule
  helper is acceptable only if the emitted rule still carries fixtures.
- Generated Cursor/Copilot/Windsurf files stay pointers, never authoritative.
  `verify` checks each adapter against its template and flags drift - which is what
  makes pointer-not-export enforceable rather than merely preferred. Adopting
  Mneme's export-the-rules approach would reintroduce the multi-copy rule drift
  AgentLintel exists to prevent.
- No license change from FSL-1.1-ALv2 + Apache-2.0 adoption surfaces in reaction to
  Mneme's MIT. Track licensing friction as a measurable adoption risk and revisit
  only if it becomes the blocking reason teams decline AgentLintel.

Consequences:

- Five scoped items enter the backlog. Items 1-2 are low-effort DX/adoption ramps;
  item 3 is the only one touching the agent-integration surface; items 4-5 are
  polish and narrative. None touches the enforcement substrate, so the
  fixture-backed guarantee is preserved by construction.
- The "already shipped" inventory above is the canonical answer for the
  capabilities it lists. A future proposal to add one of them must cite a
  concrete deficiency in the existing implementation, not its absence.

The product direction is therefore not "copy Mneme." It is: keep the AgentLintel
kernel, close the before-write and explainability gaps, and tell the story with
less ambiguity.
