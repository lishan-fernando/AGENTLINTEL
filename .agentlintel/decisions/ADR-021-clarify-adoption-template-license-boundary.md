# ADR-021: Clarify Adoption Template License Boundary

Accepted: 2026-07-07

Clarifies ADR-020. It does not change the AgentLintel Free Use No-Resale
License 1.0 for the core.

ADR-020 correctly intended adopter projects to stay under the adopter's terms,
while AgentLintel-supplied starter content stays permissive. Some public wording
described the Apache-2.0 adoption surface with path globs such as
`.agentlintel/**`. That is accurate for this repository's own AgentLintel
files, but too broad when read from an adopter repository: a private ADR or
project-specific rule should not appear to become Apache-2.0 merely because it
lives under `.agentlintel/`.

Decision:

- The Apache-2.0 adoption surface means AgentLintel-supplied templates,
  fixtures, examples, and glue, including `tools/agentlintel-cli/templates/**`
  and this repository's own `.agentlintel/**`, `.github/**`, and
  `.pre-commit-hooks.yaml`.
- In adopter repositories, only copied AgentLintel template content is
  Apache-2.0. Project-authored facts, rules, ADRs, exemplars, reports,
  generated application files, and documentation remain under the adopter's
  chosen terms unless the adopter says otherwise.
- Template-derived files remain subject to normal Apache-2.0 notice and license
  preservation for the copied AgentLintel template content.
- Public docs and claim tests must use "AgentLintel-supplied templates" or
  equivalent wording instead of a path-only `.agentlintel/**` license boundary.

Consequences:

- Proprietary adopters can use `.agentlintel/` for private project decisions
  without reading the path name as an automatic Apache-2.0 grant.
- This repository's own adoption examples and templates remain Apache-2.0.
- The license posture remains machine-checked through facts and claims tests.
- Byte-budget tests are re-baselined narrowly for the appended ADR and public
  legal clarity text: tracked repository bytes `419000` -> `423000`, eligible
  movable payload `231000` -> `232000`, and packed CLI bytes `154000` ->
  `155000`.
