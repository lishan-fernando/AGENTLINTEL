# ADR-011: Decision-Grade README and Byte-Budget Recalibration

Accepted: 2026-07-04

The eligible-payload byte budget (148,000, set during the v2 lean restructure)
was calibrated to a minimal ~3 KB README. Maintainer direction on 2026-07-04:
the README must be decision-grade — problem statement, the instruct-once
vision, process diagrams, adoption and non-adoption criteria — so a reader
can decide for or against AgentLintel without leaving the page. The README is
product surface, not dead weight, and "deterministic architecture gate" alone
undersells the mission it serves.

Decision: README.md is upgraded to decision-grade (~13 KB, two Mermaid
diagrams), and `ELIGIBLE_TRACKED_BYTE_BUDGET` in
`tools/agentlintel-cli/test/budget.test.js` is recalibrated from 148,000 to
165,000 — the new README plus modest headroom. The budget stays machine
enforced; the next recalibration requires a superseding ADR, not a silent
constant edit.
