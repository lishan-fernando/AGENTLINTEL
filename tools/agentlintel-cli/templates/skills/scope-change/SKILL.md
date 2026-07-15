---
name: scope-change
description: Use before a multi-file feature or refactor to select the smallest verified architecture context and cap exploratory reads.
---

# Scope Change

Select context before reading broadly. The frontier is a budget, not a summary
of the whole repository.

## Workflow

1. Name the business capability, planned shape, and at most three seed paths.
2. For each seed run:
   `agentlintel explain --path <seed> --shape <shape> --compact`.
3. Read only the returned exemplar, applicable decision records, and direct
   contract files. Find direct callers and tests with targeted `rg` queries.
4. Before the first edit, cap exploration at 12 source files, one exemplar,
   three search outputs, and the compact frontier. Do not preload the full
   decision history, full rules file, or unrelated slices.
5. Expand by one dependency edge only when an unresolved symbol, failing test,
   or boundary contract names it. Record the reason for every expansion.
6. Mirror the selected exemplar, implement, then run the fast diff gate:
   `agentlintel verify --diff --quiet --bail --no-run --skip-fixtures`.
7. Run affected native tests and the full gate before completion.

## Stop Conditions

Stop and ask for an exemplar when the requested shape has none. Stop when two
candidate exemplars conflict. Never use an exemption to stay inside the read
budget.

## Completion

Report files read before the first edit, frontier bytes versus full-context
bytes, expansions with reasons, exemplar used, tests, and gate result. Describe
byte reduction as a token proxy unless the coding-agent API reports tokens.
