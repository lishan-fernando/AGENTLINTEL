# ADR-024: Require Positive Architecture Evidence

Accepted: 2026-07-14

The eShop stress test showed a structural limit in AgentLintel's built-in
static rules. Line-scoped forbidden regexes can reject a known bad import, but
cannot prove that a feature reached every required surface or that a multi-line
state transition contains its safety guard. The AgentLintel arm consequently
passed while omitting query/UI delivery and permitting a pending order to be
cancelled before refund confirmation.

Decision:

1. Extend the existing `regex` rule engine with positive `required` patterns.
   Each required pattern must appear at least once across the rule's effective
   file scope. Missing evidence is a rule violation, not a fact or new concept.
2. Add an opt-in whole-file match mode so required and forbidden patterns can
   express bounded multi-line structural invariants. Existing rules retain
   line matching by default.
3. Validate the new options, fail closed on invalid regular expressions, cover
   them in rule weakening detection, and exercise them through ordinary
   conformance fixtures. Removing required evidence or changing its matching
   semantics requires a later ADR.
4. Keep the engine language-neutral and dependency-free. It is a structural
   contract, not a claim of C# semantic parsing; behavioral tests remain the
   acceptance authority.
5. Register `tools/agentlintel-cli/src/lib/engines.js` and
   `tools/agentlintel-cli/test/engines.test.js` as the canonical rule-engine and
   rule-engine-test exemplars. Future work mirrors their pure evaluation,
   explicit violation objects, prepared configuration, and exact assertions.
6. Prove product value with a matched benchmark. The upgrade is not successful
   merely because its unit tests pass; the AgentLintel arm must finish with
   fewer blind-reviewed escapes than the identical skill-plus-native-tests arm.

Rejected:

- adding another framework concept or a C#-specific parser;
- hiding more acceptance logic inside prose skills;
- treating a required source token as behavioral proof;
- giving the AgentLintel arm stronger native tests than its control; and
- claiming victory without a fresh matched run and held-out review.

Consequences:

- Adopters can express required cross-file evidence and bounded source
  relationships in `rules.yaml` with fixtures, using the existing rule concept.
- Visible rules can guide coding agents toward complete feature surfaces while
  independent tests and review still detect token gaming or semantic defects.
- The verifier, templates, specification, tests, and ratchet must agree on the
  new regex semantics before release.
