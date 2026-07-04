# ADR-015: Dormant Rules Are Visible, Never Silent

Accepted: 2026-07-04

A rule with `must_match: false` whose scope matches zero files enforces
nothing. That is a deliberate state - reference rules ship as
conformance-backed fixture-carriers until an adopter's tree grows the paths -
but until now it was an invisible state: `verify` printed
`rules 0 violation(s)` whether four rules were live or four rules were
dormant. External review correctly flagged this as a false-green risk: a
reader of CI logs could believe slice rules were active when they could not
fire.

Decision:

- `verify` computes `dormant_rules` in tree mode: file-scoped rules with zero
  scope matches that declare `must_match: false`. Zero-match rules that do not
  declare it keep the existing behavior (warning by default, error under
  `must_match: true`).
- The human output appends `, N dormant (must_match: false)` to the rules
  line; `report` counts dormant rules in the Rules row and adds a next step
  telling adopters to flip `must_match: true` once paths exist.
- Gate semantics are unchanged: dormant rules still pass, including under
  `--strict`, because `must_match: false` is an explicit, reviewable
  declaration in `rules.yaml` - weakening it away is already ratcheted.

The framework repo's own gate now reports its four dormant reference rules on
every run, which is the honest version of the dogfooding claim.
