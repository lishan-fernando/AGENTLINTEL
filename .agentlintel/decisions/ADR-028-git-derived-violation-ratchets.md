# ADR-028: Git-Derived Violation Ratchets and Leaner Verifier Boundaries

Accepted: 2026-07-28

## Context

AgentLintel already ratchets its architecture contract, but brownfield rollout
still jumped from advisory output to fixing or individually exempting every
finding. A committed violation snapshot would ease that rollout while violating
the v2 prohibition on hand-maintained mirrors of code state. The same review
found that verifier orchestration had grown to 3,353 lines and that the CLI's
single-dependency and no-build promises were advice rather than exact facts.

Decision:

1. Built-in file rules may declare `enforcement: no-new`. AgentLintel evaluates
   the candidate rule against both the target Git commit and current tree.
   Matching findings remain visible as legacy, resolved findings are counted,
   and only introduced findings keep their normal severity.
2. Violation identity is a multiset of rule, normalized repository path, and
   normalized message. Line movement is ignored, additional identical findings
   fail, and Git rename detection maps a candidate path back to its target path.
3. The baseline is derived on every full run from `--base <target-sha>`. No
   baseline artifact, new metadata concept, or regeneration command exists.
   Missing or unreadable baseline evidence fails closed under strict mode.
4. External and exemption engines reject no-new mode. External commands cannot
   be safely replayed against another tree by the current trust model, and
   invalid or expired exemption metadata must never become accepted debt.
5. Switching an existing rule from all findings to no-new is a contract
   weakening and needs exact authorization in a new ADR. Adding a new no-new
   rule remains a normal reviewed brownfield adoption.
6. External output parsing and pure rule-entry scanning move into focused
   modules. `verify.js` becomes orchestration and receives a 3,200-line
   machine-checked ceiling, below its pre-change 3,353-line size.
7. Facts now check that the publishable CLI has no build script and exactly one
   runtime dependency (`yaml`). Advice consolidates YAGNI, reuse-first,
   standard/native-first, minimal implementation, and architecture-aware
   simplification without pretending they are deterministic universal rules.

## Rejected

- a checked-in violation snapshot or count baseline, because it mirrors code
  state and creates a second thing to refresh;
- silently treating an unavailable baseline as clean;
- ignoring file identity, which would let debt move between boundaries;
- running arbitrary external commands in a temporary target checkout;
- a generic complexity score or seventh framework concept; and
- separate rules for subjective lean-code slogans.

## Consequences

- Existing repositories can enable strict CI immediately without blessing new
  debt or hiding old debt.
- Baseline evaluation adds a second built-in scan for opted-in rules during the
  full merge gate; the fast diff loop remains intentionally incomplete.
- Renames and line-only edits do not create churn, while duplicate occurrences
  and new files remain regressions.
- The tracked and eligible byte budgets must be rebaselined once after measured
  implementation and documentation growth. The measured tree was 716,165
  normalized versionable bytes, 404,560 eligible bytes, and the package was
  285,362 normalized unpacked bytes. Caps become 717,000, 407,000, and 287,000
  respectively—each with less than one percent headroom. Future growth still
  fails the same gates.
