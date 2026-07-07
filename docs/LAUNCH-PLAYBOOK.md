# Launch Playbook

Goal: get 10 serious conversations, 3 outside pilot attempts, and 1 real
architecture-drift story from someone who is not the maintainer.

## Positioning

Pitch:

> AI coding agents forget architecture. AgentLintel makes your repo architecture
> enforceable in CI.

Use: "A CI gate for AI-agent architecture drift", "Tell your agent the
architecture once, then make the PR prove it", and "AGENTS.md gives advice.
AgentLintel adds the merge gate."

Avoid: proven causal impact before benchmark results, guaranteed drift
prevention, replacement for linters/tests/review, or claims that regex proves
semantic architecture.

## Owner Handoff

After authenticating GitHub CLI as the owner account:

```bash
git push origin main
gh repo edit lishan-fernando/AGENTLINTEL --description "Deterministic CI gate that keeps AI coding agents from violating your repo architecture."
npm view @agentlintel/cli version
```

Add topics in GitHub or with repeated `gh repo edit --add-topic`: `ai-agents`,
`coding-agents`, `architecture`, `ci`, `github-actions`, `agents-md`,
`agent-skills`, `claude-code`, `cursor`, `copilot`, `codex`,
`architecture-tests`. Pin the repo on the `lishan-fernando` profile. Keep the
README tarball-first until npm matches the current GitHub release.

## Feedback Ask

Ask 10 people for feedback, not stars:

```text
Hey <name>, I built AgentLintel for a problem I kept hitting with AI coding
agents: they follow architecture instructions for a while, then drift across
sessions. Would you glance at the README and tell me what feels unclear or
unconvincing? I am looking for blunt feedback more than promotion.
https://github.com/lishan-fernando/AGENTLINTEL
```

## Ethics

Ask for evidence, not approval. Do not manufacture urgency, buy fake stars, or
claim production proof before public evidence exists. Ask before quoting a
story and anonymize by default. Never ask people to paste private code, secrets,
customer data, or private logs into a public issue.
