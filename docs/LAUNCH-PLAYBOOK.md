# Launch Playbook

Goal: get the first 10 serious conversations, the first 3 outside pilot repos,
and one public drift story from someone who is not the maintainer.

This is not a hype plan. AgentLintel is early infrastructure. The launch should
ask for feedback from people who already feel AI-agent architecture drift, then
turn their objections into docs, fixtures, and sharper defaults.

## Positioning

One-line pitch:

> AI coding agents forget architecture. AgentLintel makes your repo architecture
> enforceable in CI.

Fifteen-second version:

> AgentLintel is a deterministic architecture gate for AI-agent codebases. You
> keep repo conventions in `AGENTS.md`, `SKILL.md`, and `.agentlintel/`; agents
> read them while working, and CI fails pull requests that violate the rules.

Use these headlines:

- A CI gate for AI-agent architecture drift.
- Tell your agent the architecture once, then make the PR prove it.
- AGENTS.md gives advice. AgentLintel adds the merge gate.

Do not lead with:

- Fair-source governance framework.
- Human-AI repository operating system.
- Universal AI architecture compliance.

Those may be accurate in pieces, but they make people decode the project before
they feel the pain.

## Public Shop Window

GitHub repo description:

> Deterministic CI gate that keeps AI coding agents from violating your repo
> architecture.

GitHub topics:

```text
ai-agents
coding-agents
architecture
software-architecture
ci
github-actions
code-quality
static-analysis
agents-md
agent-skills
claude-code
cursor
copilot
codex
devtools
architecture-tests
```

Keep the README first screen focused on problem, promise, install, and when to
use it. Move philosophy down-page.

## Launch Sequence

First 48 hours:

1. Set the GitHub description and topics.
2. Pin the repo on the `lishan-fernando` GitHub profile.
3. Sync npm so `@agentlintel/cli` matches the current GitHub release, or keep
   the README tarball-first until it does.
4. Open 3 starter issues labeled `good first pilot`: one JavaScript repo, one
   .NET repo, one custom architecture repo.
5. Ask 10 people for feedback, not stars.

Week 1:

1. Publish one concise launch post on LinkedIn, X, or both.
2. Post a feedback-first thread in one relevant community where you already
   participate.
3. Create a 90-second terminal demo GIF or video: break a rule, watch verify
   fail, fix it, watch CI pass.
4. Offer to configure AgentLintel on 3 real repos for free in exchange for
   permission to quote the drift story anonymously.

Weeks 2-4:

1. Turn repeated objections into README FAQ entries or docs.
2. Add fixtures for any rule confusion found in pilots.
3. Publish one case note: "What AgentLintel caught in a real AI-agent PR."
4. Run the benchmark protocol before making causal improvement claims.

## Outreach Scripts

Direct message:

```text
Hey <name>, I built a small tool for a problem I kept hitting with AI coding
agents: they follow architecture instructions for a while, then drift across
sessions.

AgentLintel turns repo architecture into a deterministic CI gate. No model
calls, just AGENTS.md/SKILL.md plus rules and fixtures that can fail a PR.

Would you be willing to glance at the README and tell me what feels unclear or
unconvincing? I am looking for blunt feedback more than promotion.
https://github.com/lishan-fernando/AGENTLINTEL
```

Launch post:

```text
I built AgentLintel because AI coding agents kept forgetting repo architecture
between sessions.

The idea is simple: architecture advice should not live only in prompts. Put it
in the repo, make it small enough for agents to read, and fail CI when a PR
violates it.

AgentLintel gives you:
- verified repo facts
- deterministic rules with fixtures
- write-boundary guard zones
- exemplars agents can mirror
- standard AGENTS.md and SKILL.md surfaces
- append-only ADRs for architecture changes

It is early, local-first, and intentionally boring: no model calls, no hosted
service, no telemetry.

I would love feedback from people using Claude Code, Cursor, Codex, Copilot, or
other coding agents on non-trivial repos.
https://github.com/lishan-fernando/AGENTLINTEL
```

Community post:

```text
I am looking for feedback on an early tool for AI-agent codebases.

Problem: coding agents often follow architecture instructions in one session,
then drift in another. AgentLintel keeps those rules in the repo and makes them
deterministic enough to fail CI.

I am especially trying to learn:
- Does the README explain the problem quickly?
- Would the install/setup flow fit your repo?
- Which architecture rule would you want enforced first?

Repo: https://github.com/lishan-fernando/AGENTLINTEL
```

## Founder Nerves

Feeling shy is normal. The move is to ask for evidence, not approval.

If the idea is weak, a quiet launch will not protect you; it will only make the
lesson slower. If the idea is strong, people still need repeated, clear
exposure before they understand it. The emotionally safer framing is:

> I am testing whether this pain is real for other teams.

That is honest, humble, and much easier to say than "please make my project
popular."

## What To Measure

Track weekly:

- README visits, clones, stars, forks, and npm downloads.
- Number of people who reply with a real architecture-drift story.
- Number of repos that run `agentlintel init`.
- Number of pilots that wire `verify --strict` into CI.
- Objections repeated by 2 or more people.

Stars are useful because they create social proof, but the real leading
indicator is a developer saying: "Yes, my agent did exactly this."

## Claims Boundary

Say:

- AgentLintel gives AI-agent repos a deterministic architecture gate.
- Built-in rules are portable starter checks.
- Deep checks should use project-native analyzers through `engine: external`.
- The project is early and looking for pilot feedback.

Avoid:

- Proven causal impact before benchmark results.
- Guaranteed prevention of architecture drift.
- Replacement for linters, tests, static analysis, or code review.
- Claims that regex alone proves semantic architecture.

