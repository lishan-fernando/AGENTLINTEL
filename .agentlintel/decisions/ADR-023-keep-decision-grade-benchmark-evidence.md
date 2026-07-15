# ADR-023: Keep Decision-Grade Benchmark Evidence

Accepted: 2026-07-14

AgentLintel's impact claim was tested on the pinned Microsoft/.NET eShop
`dotnet8` snapshot with four matched arms: plain, skill-only, identical native
C# checks without AgentLintel, and the same checks wrapped by AgentLintel. One
mid-tier high-effort coding-agent run per arm implemented the same distributed
paid-cancellation feature. Three reviewers scored frozen anonymous patches.

Evidence:

- `.agentlintel/reports/stress-test/2026-07-14--dotnet-eshop.md` records the
  controls, hashes, checks, costs, file-and-line findings, clean sweeps, and
  limitations.
- The plain arm skipped most of the workflow. A strong skill materially
  improved it. The native-gate arm was strongest, while every arm retained
  rejection-level defects.
- The AgentLintel arm passed its configured gate while a second request could
  move `CancellationPending` directly to `Cancelled` before refund success.
- The skill-only arm was comparable to the AgentLintel arm at lower setup and
  coding-agent cost. The single run therefore did not demonstrate incremental
  AgentLintel product-quality value.
- The first report and fair four-arm protocol exceed the prior frozen byte caps;
  silently hiding the report, deleting the budget, or raising it without a
  decision would violate the framework's own evidence standard.

Decision:

1. Retain one curated, decision-grade empirical report in `.agentlintel/reports`.
   It is verifier-checked output, not a seventh kernel concept or a metadata
   mirror of code state. Raw logs, worktrees, and patches remain ignored local
   evidence under `examples/agentlintel-stress/`.
2. Replace the three-arm prose control in `docs/BENCHMARK-PROTOCOL.md` with
   Plain, Skill, Native gate, and AgentLintel arms. Repeated studies must freeze
   held-out checks, use independent seeds, blind patches, and measure setup and
   runtime cost as well as final escapes.
3. Keep public impact claims bounded. This pilot supports “skills helped” and
   “AgentLintel's incremental value was not demonstrated,” not a general claim
   that the framework never helps.
4. Rebaseline normalized versionable bytes to 621,000 and eligible movable
   bytes to 348,000. Both retain less than one percent headroom after this
   evidence, protocol, ADR, and budget-comment change.
5. Future reports must fit these caps, replace stale evidence, or carry another
   explicit decision. This ADR does not authorize an unbounded report archive.

Rejected:

- counting a visible green gate as feature acceptance;
- comparing AgentLintel only with plain prompting or pasted rule prose;
- omitting the native-gate arm when AgentLintel wraps external language checks;
- ignoring `.agentlintel/reports` to make the byte test pass;
- weakening held-out checks after seeing an agent's patch; and
- claiming general effectiveness from one task and one run per arm.

Consequences:

- The repository carries the evidence needed to audit its most important
  product claim, and the lean-budget increase is explicit and machine-bounded.
- AgentLintel remains an alpha whose product-quality value needs repeated
  evidence. Governance enforcement and product-defect reduction are measured
  separately.
- The next study must show a meaningful reduction in final escape severity over
  both Skill and Native gate before the framework claims incremental value.
