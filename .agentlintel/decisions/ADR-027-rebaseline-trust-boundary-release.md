# ADR-027: Rebaseline the Trust-Boundary Release

Accepted: 2026-07-14

ADR-026 added exact authorization, protected evidence, sticky positive-rule
triggers, a compact context frontier, two skills, and adversarial tests. The
full suite then measured 683,008 normalized versionable bytes, 386,723 eligible
movable bytes, and 272,441 normalized packaged bytes before this decision was
added. The compact rule-engine frontier measured 25,946 bytes against 87,757
full-context bytes, a 70.4 percent reduction under the declared byte proxy.

Decision:

1. Rebaseline normalized versionable bytes to 688,000, eligible movable bytes
   to 390,000, and the shipped npm payload to 274,000.
2. Keep intended headroom below one percent after this ADR. Future growth must
   earn another measured decision rather than silently expanding a cap.
3. Keep the compact-context acceptance threshold at 50 percent. Repository and
   package growth do not offset or relax that efficiency requirement.
4. Report the 70.4 percent result only as a versionable-byte token proxy. Do
   not claim 50 percent coding-model token savings until repeated matched-agent
   runs report API token counts.

Rejected:

- deleting adversarial tests or evidence protection to preserve the old cap;
- hiding skill bodies outside the package budget;
- counting generated or ignored state instead of versionable normalized bytes;
  and
- presenting the context proxy as an empirical model-token result.

Consequences:

- the cost of the trust-boundary release remains explicit and machine-capped;
- adopters receive both new skills and the compact frontier in the package; and
- the next stress test has two separate acceptance measures: at least 50
  percent context-proxy reduction and actual matched-agent token usage.
