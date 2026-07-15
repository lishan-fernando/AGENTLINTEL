# ADR-025: Retain Positive Evidence with Bounded Claims

Accepted: 2026-07-14

ADR-024 required a fresh matched benchmark before treating positive regex
evidence as useful. The upgraded gate rejected the original eShop AgentLintel
patch with 35 findings. In the fresh C2/E rerun, E delivered the known state,
contract, query, WebApp, and risk-test evidence that C2 missed, while using
fewer coding-agent tokens and slightly less wall time.

The result did not satisfy the preregistered product-value threshold. Three
blind reviewers scored final escape severity at a mean 18.0 for C2 and 16.7
for E: a 7.4 percent reduction, not the required 20 percent. Every reviewer
rejected both patches. E's green gate missed undiscoverable Entity Framework
migrations, and both arms permitted contradictory refund outcomes on
redelivery. One task and one seed cannot establish a general effect.

Decision:

1. Retain the existing regex engine's `required`, `when`, and `match: file`
   options. They closed demonstrated negative-only enforcement gaps without
   adding a seventh framework concept or a language dependency.
2. Describe the capability as positive structural evidence, never behavioral
   proof. A green gate means only that configured contracts passed.
3. Keep the public product claim bounded: this run is directional evidence
   that AgentLintel can improve compliance with encoded contracts, but it does
   not prove superiority over a strong skill plus native executable checks.
4. Future repeated studies must execute the real persistence deployment
   discovery path and contradictory-redelivery scenarios as frozen held-out
   checks. Filename or source-token presence is insufficient.
5. Rebaseline normalized versionable bytes to 648,000, eligible movable bytes
   to 364,000, and the shipped npm payload to 255,000. These caps cover the
   verifier, fixtures, specification, benchmark evidence, and this decision
   with less than one percent intended headroom; later growth requires another
   explicit decision.

Rejected:

- removing positive evidence because the first fresh patch was still rejected;
- claiming AgentLintel won because E passed more frozen checks;
- claiming skills alone are equivalent to deterministic PR enforcement;
- treating AgentLintel's implementation as uniquely capable when native tests
  and scripts can enforce equivalent project contracts; and
- weakening or editing the frozen evaluator to improve the reported score.

Consequences:

- AgentLintel keeps a verified way to require cross-file architecture evidence,
  with fixtures, validation, ratcheting, and partial-scope safeguards.
- The stress-test report preserves both the original failure and the upgraded
  rerun, including the critical escapes from the green treatment.
- Adoption remains an engineering trade: the framework packages governance and
  enforcement, while its incremental defect-reduction value remains unproved.
