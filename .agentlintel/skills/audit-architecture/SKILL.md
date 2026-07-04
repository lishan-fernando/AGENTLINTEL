---
name: audit-architecture
description: Use to audit architecture drift, dead code, stale docs, or conformance debt with file:line evidence.
---

# Audit Architecture

Audits are evidence documents. Every finding needs `file:line` proof or an
explicit "checked, none found". Auditing is read-only unless remediation is
approved.

## Workflow

1. Baseline: read facts, run `agentlintel verify`, and run declared build/test
   commands. Record pass/fail output.
2. Sweep: dead code, stale agent-facing text, five-rule conformance debt,
   governance drift, and exemption ledger.
3. Report to `.agentlintel/reports/<topic>/<YYYY-MM-DD>--<repo>.md`.

## Report Shape

- Header: repo, scope, date, partial/full.
- Baseline command table.
- Findings table: id, path, evidence, severity, action.
- Clean sweeps with searches run.
- Exemption ledger.
- Top three risks.
- Follow-up verification commands.

## Rules

Findings are rows, not essays. Severity follows consequence. Recommended
actions are concrete: delete, reword, demote, fix, or accept-with-note.

## Completion

Report path, finding counts, top risks, baseline results, and clean categories.
