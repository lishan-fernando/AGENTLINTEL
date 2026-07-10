# Security And Privacy

AgentLintel is local-first.

## CLI Behavior

- Reads `.agentlintel` metadata and selected repo files.
- Writes scaffolded files only during `init`.
- Writes reports only when `report` output is redirected or captured by CI.
- Runs shell commands only from fact checks or external rules, and only when
  not using `--no-run`. They require a committed Git snapshot; any change to
  versionable state during verification fails the gate.
- The built-in verifier makes no model calls, network calls, telemetry uploads,
  or background daemon. Repository-declared command facts and external engines
  are arbitrary tools and may use network access; review and sandbox them.

## Sensitive Data

Do not place secrets, credentials, production data, raw provider payloads, PII,
regulated financial data, or private third-party data in governance files:

- `AGENTS.md`
- `.agentlintel/facts.yaml`
- `.agentlintel/rules.yaml`
- `.agentlintel/guard.json`
- `.agentlintel/exemplars.yaml`
- `.agents/skills/**`
- `.agentlintel/decisions/**`
- generated reports

The default `secrets.no-logging` rule is a lightweight code guard. Use a
dedicated secret scanner for credential detection.

## Untrusted PRs

Run forked or untrusted pull requests with `--no-run` so edited facts or
external rules cannot gain CI command execution. That run is deliberately
incomplete under `--strict`; execute the full gate in a trusted environment
before merge.

ADRs, exemption `Approver:` fields, and other in-repo text record provenance;
they do not authenticate a human approval. Protect `.agentlintel/**`,
`.agents/skills/**`, `AGENTS.md`, and verifier workflows with base-branch
CODEOWNERS plus required code-owner review. GitHub evaluates CODEOWNERS from
the base branch, outside the candidate change.
Apply the same boundary to every external-engine script, config, and dependency
lockfile; protecting only the rule that names a mutable checker is insufficient.
