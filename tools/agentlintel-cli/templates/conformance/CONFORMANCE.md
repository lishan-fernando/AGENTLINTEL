# Conformance Fixtures

Each rule in `.agentlintel/rules.yaml` needs fixtures under
`.agentlintel/conformance/<rule-id>/cases/`.

```text
cases/pass-<name>/  source tree + expected.yaml with violations: []
cases/fail-<name>/  source tree + expected.yaml listing expected violations
```

`expected.yaml`:

```yaml
violations:
  - rule: slice.no-deep-imports
    file: slices/Workflow/interface/handler.ts
    line: 3
    message_contains: "Deep imports"
```

Fixture checks compare only the rule under test: every expected violation must
appear, and no extra violation for that rule may appear. External-rule fixtures
use recorded `output.jsonl` or adapter-native stdout; add `status.txt` for
status-based adapters such as `command-status`. The live external engine does
not run during fixture checks.

Fixtures are the rule contract. A rule change without fixture evidence should
not merge.
