---
applyTo: "**"
---

<!-- agentlintel-adapter: copilot-code-review@2 -->

Read `AGENTS.md`; `.agentlintel/rules.yaml` wins over prose.

Before done: `npx @agentlintel/cli verify`; CI uses full history and
`agentlintel verify --strict --base <target-sha>`.

For code review, reject rule failures; fact, exemplar, rule, or guard weakening
without a new ADR; existing ADR edits; adapter/hook drift; guard bypasses; and
incomplete or expired exemptions.

Regenerate with `agentlintel init --adapters --force`.
