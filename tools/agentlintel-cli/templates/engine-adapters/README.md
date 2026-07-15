# External Engine Adapters

Starter glue for `engine: external` rules. Native tools do deep analysis;
AgentLintel owns rule id, fixtures, reports, CI status, and hook tiering.

Use `adapter: command-status` for any checker that exits non-zero on drift:

```yaml
- id: architecture.contract
  severity: error
  engine: external
  evidence: [package.json, package-lock.json]
  adapter: command-status
  scope: tree
  run: "npm run architecture:check"
  message: "Repository architecture contract must pass."
```

Exit 0 passes. Exit 1 is a rule violation. Other exits are engine failures
unless the rule declares `ok_exits`.

Copy `external-rules.snippets.yaml` entries into `.agentlintel/rules.yaml`;
copy matching `conformance-snippets/` dirs into `.agentlintel/conformance/`.

Commit and PR policy starters are generated as editable scripts under
`.agentlintel/adapters/`. Tune their env vars or replace them. The PR starter
checks title, description, changed-file count, and line delta.
