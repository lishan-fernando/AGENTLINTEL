# Security And Privacy

AgentLintel is local-first.

## CLI Behavior

- Reads `.agentlintel` metadata and selected repo files.
- Writes scaffolded files only during `init`.
- Writes reports only when `report` output is redirected or captured by CI.
- Runs shell commands only from fact checks or external rules, and only when
  not using `--no-run`.
- Makes no model calls, network calls, telemetry uploads, or background daemon.

## Sensitive Data

Do not place secrets, credentials, production data, raw provider payloads, PII,
regulated financial data, or private third-party data in governance files:

- `AGENTS.md`
- `.agentlintel/facts.yaml`
- `.agentlintel/rules.yaml`
- `.agentlintel/guard.json`
- `.agentlintel/exemplars.yaml`
- `.agentlintel/skills/**`
- `.agentlintel/decisions/**`
- generated reports

The default `secrets.no-logging` rule is a lightweight code guard. Use a
dedicated secret scanner for credential detection.

## Untrusted PRs

Run forked or untrusted pull requests with `--no-run` so edited facts or
external rules cannot gain CI command execution.
