# Launch Playbook

Goal: get 10 serious conversations, 3 outside pilot attempts, and 1 real
architecture-drift story from someone who is not the maintainer.

## Positioning

One-line pitch:

> AI coding agents forget architecture. AgentLintel makes your repo architecture
> enforceable in CI.

Use these:

- A CI gate for AI-agent architecture drift.
- Tell your agent the architecture once, then make the PR prove it.
- AGENTS.md gives advice. AgentLintel adds the merge gate.

Avoid these:

- Proven causal impact before benchmark results.
- Guaranteed prevention of architecture drift.
- Replacement for linters, tests, static analysis, or code review.
- Claims that regex alone proves semantic architecture.

## First 48 Hours

1. Set the GitHub description:
   `Deterministic CI gate that keeps AI coding agents from violating your repo architecture.`
2. Add topics: `ai-agents`, `coding-agents`, `architecture`, `ci`,
   `github-actions`, `agents-md`, `agent-skills`, `claude-code`, `cursor`,
   `copilot`, `codex`, `architecture-tests`.
3. Pin the repo on the `lishan-fernando` GitHub profile.
4. Keep the README tarball-first until npm matches the current GitHub release.
5. Ask 10 people for feedback, not stars.

## Feedback Ask

```text
Hey <name>, I built AgentLintel for a problem I kept hitting with AI coding
agents: they follow architecture instructions for a while, then drift across
sessions.

It turns repo architecture into a deterministic CI gate: AGENTS.md/SKILL.md for
agent-readable guidance, plus rules and fixtures that can fail a PR.

Would you be willing to glance at the README and tell me what feels unclear or
unconvincing? I am looking for blunt feedback more than promotion.
https://github.com/lishan-fernando/AGENTLINTEL
```

## Ethics

Ask for evidence, not approval. Do not manufacture urgency, buy fake stars, or
claim production proof before public evidence exists. If someone shares a story,
ask before quoting it and anonymize by default. Never ask people to paste
private code, secrets, customer data, or private logs into a public issue.

