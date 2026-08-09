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

## .NET compiler and analyzer diagnostics

Import the generated profile once from the repository `Directory.Build.props`:

```xml
<Import Project=".agentlintel/adapters/dotnet-code-quality.props" />
```

Then copy and tune `dotnet.code-quality` from the snippets, including its
solution path and `evidence` list. Restore before verification; the starter
uses `--no-restore` so the architecture gate does not change dependencies.
The runner writes compiler `ErrorLog` files to an OS temporary directory,
merges SARIF 2.1 results, normalizes in-repository paths, and removes the
temporary directory. A diagnostic exits 1; missing tools, malformed SARIF, a
timeout, or a failed build with no diagnostic evidence exits 2 and fails closed.

The supplied global config is deliberately a starter. Microsoft analyzers
cover style and several design/async rules, but CA1034 only rejects visible
nested types. Enforce strict no-nested-types, one-type-per-file, filename/type
agreement, service-location bans, and repository-specific OOP/SOLID policies
with a pinned Roslyn analyzer or architecture tests. Keep their project,
configuration, and dependency lockfiles in the rule's `evidence` list.

Commit and PR policy starters are generated as editable scripts under
`.agentlintel/adapters/`. Tune their env vars or replace them. The PR starter
checks title, description, changed-file count, and line delta.
