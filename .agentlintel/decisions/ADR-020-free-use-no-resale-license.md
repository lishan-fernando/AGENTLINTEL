# ADR-020: Free-Use No-Resale License

Accepted: 2026-07-07

Supersedes ADR-012 for versions released with this decision.

Maintainer direction on 2026-07-07 clarified the intended license posture:
AgentLintel must be free to use in personal, internal, commercial, and
non-commercial projects. Humans and AI systems may use it to create project
code, ADRs, documentation, configuration, and other files, and those project
outputs belong to the project owner. The one prohibited activity is selling
AgentLintel itself, including selling a fork or rebranded substantially similar
system under another name.

ADR-012 chose `FSL-1.1-ALv2`. That was close but not exact: FSL grants each
version an irrevocable Apache-2.0 license after two years, which eventually
removes the no-resale restriction for the code. The intended policy is a
permanent no-resale boundary for AgentLintel itself, not a two-year head start.

Decision:

- **Core -> AgentLintel Free Use No-Resale License 1.0**
  (`LicenseRef-AgentLintel-Free-Use-No-Resale-1.0`): free to use, copy,
  modify, fork, and redistribute for any purpose except selling AgentLintel
  itself, a fork, or a paid substantially similar hosted or packaged product.
- **Adoption surface -> Apache-2.0**: `.agentlintel/**`, `.github/**`,
  `.pre-commit-hooks.yaml`, `tools/agentlintel-cli/templates/**`, and
  generated starter files remain permissive so adopter repositories do not
  inherit the no-resale license.
- Package metadata uses `SEE LICENSE IN LICENSE`, because the core license is
  custom rather than an SPDX-listed license.
- Source headers for core files use
  `SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0`.
- Previously published copies keep their published license grants. The new
  posture applies to versions that ship this license file.

Consequences:

- Public docs must say "source-available free use" rather than "open source"
  or "fair source".
- Public docs must say using AgentLintel does not change ownership or license
  terms for the user's project, including AI- or human-created project files.
- The license posture remains machine-checked through facts and claims tests.
- Repository and package byte budgets are re-baselined for the added legal
  clarity text, but the legal and test files remain excluded from movable
  payload wherever the existing budget rules already treat them as governance
  overhead.
