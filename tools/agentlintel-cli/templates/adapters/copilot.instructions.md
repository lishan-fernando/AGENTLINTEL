---
applyTo: "**"
---

<!-- agentlintel-adapter: copilot-code-review@2 -->

Read `AGENTS.md`; `.agentlintel/rules.yaml` wins over prose.

Before done: `npx @agentlintel/cli verify`; CI: `agentlintel verify --strict`.

For code review, reject rule failures, rule weakening without ADR,
adapter/hook edits, guard bypasses, or incomplete/expired exemptions.

Regenerate with `agentlintel init --adapters --force`.
