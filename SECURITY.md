# Security Policy

## Scope

AgentLintel is documentation, schemas, templates, conformance fixtures, and a
local-first CLI (`tools/agentlintel-cli`, plain Node.js, one dependency). There
is no hosted service, no telemetry, and no model call; see
[docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md) for exactly what the CLI
reads, writes, and executes.

In scope:

- CLI behavior that could execute unexpected commands, escape the repository
  root, or mishandle untrusted input (crafted YAML/JSON, external-engine
  output, fixture or workspace paths);
- guidance or templates that could lead adopters toward unsafe behavior, such
  as logging secrets, bypassing authorization, or loading sensitive context
  into AI tools.

### Out of Scope

- Vulnerabilities in adopters' own implementations of AgentLintel.
- Third-party verifiers, linters, or IDE plugins.
- Fail-case conformance fixtures (which are intentionally broken).

## Reporting a Problem

Please report sensitive issues privately rather than opening a public issue.

Use GitHub private vulnerability reporting for this repository when it is
available. If it is not available, contact the repository maintainer through
the GitHub owner profile rather than opening a public issue.

Please include the file path or fixture case, the risk, and the smallest example that shows the problem. Response is best-effort for a single-maintainer draft project.
