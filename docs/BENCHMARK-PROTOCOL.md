# Benchmark Protocol

Purpose: test whether AgentLintel reduces final architecture-contract escapes,
not merely whether its verifier can detect seeded violations. Until repeated
trials are published, impact claims stay bounded.

## Arms

Run each task from the same repository snapshot with the same coding model,
reasoning effort, prompt, time budget, and allowed tools:

1. **Plain:** upstream instructions only.
2. **Skill:** a real project-specific `SKILL.md` with exemplars and principles,
   but no executable architecture gate.
3. **Native gate:** the identical skill plus the same native executable
   architecture tests used by the treatment, without AgentLintel.
4. **AgentLintel:** the identical skill and native checks plus AgentLintel facts,
   rules, fixtures, guard, exemplars, and verification.

The native-gate arm is required whenever AgentLintel wraps a language-native or
external engine. Without it, test quality is confounded with framework value.

## Tasks and repetitions

Use at least six realistic tasks per repository, including:

- add a slice or business capability;
- touch an authenticated boundary handler;
- change an error or state-machine contract;
- introduce an integration and persistence path;
- refactor across a public/private surface;
- change a retry, idempotency, or concurrency path.

Run at least eight independent seeds per arm. Freeze reviewer-owned acceptance
tests and expected architecture contracts before coding starts. Coding agents
must not be able to edit held-out tests or treatment configuration.

## Metrics

- Weighted severity of final architecture and data-integrity escapes.
- Held-out functional acceptance rate.
- Violations caught and repaired before the final diff.
- False-positive and false-negative gate results.
- Human review comments and correction cycles to a mergeable diff.
- Setup files/lines and authoring time per treatment.
- Coding-agent input/output tokens and wall time.
- Exemptions added and whether they are complete and unexpired.

Report green self-authored tests separately from held-out acceptance. A repaired
violation is a gate catch; a final violation is an escape.

## Decision criteria

Starting thresholds, to be preregistered before a study:

- at least 20% lower weighted final-escape severity than both Skill and Native
  gate;
- no more than 5 percentage points lower held-out functional acceptance; and
- no more than 15% ongoing operating overhead unless avoided severity justifies
  the extra cost.

If Skill matches AgentLintel and costs less, the skill-only claim is supported.
If Native gate matches AgentLintel, the executable checks helped but the wrapper
has not shown incremental product-quality value. Governance benefits must be
measured separately rather than inferred.

## Anti-cheating

- Freeze repository snapshots, prompts, treatment files, and dependency locks.
- Hash treatment instructions and native checks to prove equality.
- Exclude infrastructure-failed runs using rules fixed before quality review.
- Freeze complete patches, including untracked files, before review.
- Blind-review anonymous patches before revealing arms.
- Publish anonymized tasks, commands, hashes, raw counts, and excluded runs.
- Keep product secrets out of artifacts.

## Evidence

The first matched C# pilot is recorded in
`.agentlintel/reports/stress-test/2026-07-14--dotnet-eshop.md`. It found that a
strong skill clearly improved on plain prompting, while AgentLintel did not beat
the skill or identical native checks in one run. That result is exploratory,
not a general framework verdict.

A second matched C2/E rerun added positive whole-scope evidence to AgentLintel.
The upgraded gate rejected the old treatment with 35 findings, and the fresh E
patch fixed the known pending-state, stale-result, payload, query, WebApp, and
risk-test gaps. Held-out checks reported 6/14 for C2 and 13/14 for E; the sole E
miss was adjudicated as an evaluator false negative from searching the wrong
service corpus. However, blind mean escape severity improved only from 18.0 to
16.7 (7.4%, below the preregistered 20%), and every reviewer rejected both.

The rerun also adds two mandatory held-out patterns for future studies:

- prove persistence changes are discoverable by the real deployment mechanism
  (for EF Core, include `dotnet ef migrations list`), not merely that migration
  filenames exist;
- redeliver the same side-effect request after the outcome source changes and
  assert that a durable first outcome prevents contradictory downstream state.

The current evidence supports retaining positive evidence as a useful gate
capability. It still does not support claiming that AgentLintel beats a strong
skill plus native executable checks, or that either fresh patch was mergeable.

`tools/agentlintel-cli/test/benchmark-protocol.test.js` remains a mechanical
seed: it proves stale facts, rule drift, guard drift, expired exemptions,
missing fixtures, and rule weakening are detectable. It is not market evidence.
