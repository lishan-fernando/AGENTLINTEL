# ADR-012: Fair-Source Relicense — FSL Core, Apache-2.0 Adoption Surface

Accepted: 2026-07-04

Maintainer direction on 2026-07-04, before release: anyone may
use AgentLintel and ship their own software with it, but nobody may sell
AgentLintel itself. Apache-2.0 alone cannot express that — it grants
unrestricted commercial redistribution, so a third party could lawfully
resell or rehost the CLI verbatim the day after launch.

Decision — two licenses, one boundary, mapped in LICENSE-POLICY.md:

- **Core → `FSL-1.1-ALv2`** (Functional Source License 1.1 with Apache-2.0
  future grant): CLI `bin/`, `src/`, `test/`, `SPEC.md`, `README.md`,
  `docs/`, and any file not carved out below. Free for any use except a
  commercial substitute for AgentLintel; each version converts irrevocably
  to Apache-2.0 two years after it is made available. The moat is a head
  start, not an enclosure.
- **Adoption surface → Apache-2.0** (unchanged):
  `tools/agentlintel-cli/templates/**`, `.agentlintel/**`, `.github/**`,
  `.pre-commit-hooks.yaml`. Everything scaffolded into or integrating with
  adopter repositories must carry no fair-source restriction, or the
  instruct-once promise costs every adopter a legal review.
- The trademark policy, not copyright, is the permanent barrier to selling
  under the AgentLintel name — it survives the Apache conversion.
- Releases up to and including `v2.0.0-alpha.4` were published Apache-2.0
  and remain so; the relicense applies from the next release.

Sole-author relicense: every commit to date is by the copyright holder, so no
third-party consent is required. Mechanical consequences in the same diff:
`LICENSE` becomes the FSL text, the Apache text moves to `LICENSE-APACHE`,
the CLI package ships its own `LICENSE`, SPDX headers flip on core source,
`package.json` license fields become `FSL-1.1-ALv2`, and the guard and
dead-weight exclusions admit the new license files.
