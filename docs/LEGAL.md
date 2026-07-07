# AgentLintel Legal Boundary

Summary only; license texts control. The root keeps one primary `LICENSE`.
Apache text lives in the CLI package so Apache templates ship with it without
extra root license tabs on GitHub.

## Licenses

| What | License | Text |
|---|---|---|
| **Core** - CLI source, package tests, spec, docs, legal files, and every file not carved out below | AgentLintel Free Use No-Resale License, Version 1.0 (SPDX: `LicenseRef-AgentLintel-Free-Use-No-Resale-1.0`) | [LICENSE](../LICENSE) |
| **AgentLintel-supplied adoption templates and examples** - `tools/agentlintel-cli/templates/**`, this repository's own `.agentlintel/**`, this repository's own `.github/**`, and `.pre-commit-hooks.yaml` | Apache License, Version 2.0 | [tools/agentlintel-cli/LICENSE-APACHE](../tools/agentlintel-cli/LICENSE-APACHE) |

Many source and config files carry `SPDX-License-Identifier` headers. A file's
header wins; otherwise the boundary above wins. Compact fixtures and generated
starter files may omit a header to keep line-number fixtures stable; they are
still Apache-2.0 when they are AgentLintel-supplied template or repository
adoption files.

## Free Uses

- Run AgentLintel on personal, internal, commercial, or non-commercial
  codebases.
- Build, sell, license, host, or distribute your own software with it.
- Use AgentLintel in CI, development, review, release, maintenance, and client
  service workflows.
- Read, modify, fork, and redistribute AgentLintel for free, as long as the
  license and notices stay with it.
- Implement and integrate the protocol; AgentLintel-supplied contract
  templates, fixtures, GitHub Action/workflow glue, and pre-commit glue are
  Apache-2.0.

## Your Projects and Outputs

Using AgentLintel does not change the license of your source code, product,
repo, ADRs, documentation, generated files, or other output. You need not
publish source, use a hosted service, send code to AgentLintel, or grant
AgentLintel rights to your project.

In an adopter repository, only AgentLintel-supplied template content is
Apache-2.0. Project-specific files authored by the adopter - including facts,
rules, ADRs, exemplars, reports, generated application files, and documentation
- are not made Apache-2.0 merely because they live under `.agentlintel/` or
were checked by AgentLintel.

Template-derived files remain subject to normal Apache-2.0 notice/license
preservation for the copied AgentLintel template content.

If you build a library management system with AgentLintel, the library
management system code, ADRs, docs, and AI- or human-created project files are
yours to license, sell, publish, keep private, or otherwise use however you
choose. Just do not sell AgentLintel itself with it.

Apache-2.0 applies only to AgentLintel-supplied adoption templates and examples,
with normal notice/license preservation when redistributed. Original files you
create beside those adoption files are yours unless you choose to license them
otherwise.

## No-Resale Limits

Do not sell AgentLintel itself. That includes selling, reselling, leasing,
charging for access to, rebranding, renaming, white-labeling, or lightly
modifying the CLI, a fork, or substantially the same architecture-gate system
as a paid product, marketplace listing, SaaS, hosted service, managed service,
or API.

Bundling AgentLintel with a paid product is allowed only when AgentLintel is
incidental development or CI tooling for your project, not something customers
are paying to receive as a separate or primary feature.

### Can a consultancy or internal platform team use AgentLintel?

Yes. You may use AgentLintel while building, reviewing, maintaining, or
delivering software for your company or clients.

The restriction is on selling AgentLintel itself - for example, a paid rebrand,
fork, hosted AgentLintel service, marketplace listing, or product whose primary
value is substantially the same AgentLintel architecture gate.

Using AgentLintel as incidental development or CI tooling for your own product,
client project, or internal platform is allowed.

The no-resale restriction is permanent for versions released under the
AgentLintel Free Use No-Resale License. There is no automatic Apache-2.0
conversion in this license.

The AgentLintel name is separately protected; see
[TRADEMARKS.md](../TRADEMARKS.md).

## Earlier Published Copies

Previously published copies keep the license they were published under.
Releases up to and including `v2.0.0-alpha.4` were published under
Apache-2.0. Releases from `v2.0.0-alpha.5` through `v2.0.0-alpha.10` were
published under `FSL-1.1-ALv2`, including that license's future Apache-2.0
grant. Those already-granted rights are not revoked.

The current legal posture starts with versions that ship this `LICENSE` file.

## Reserved Commercial Assets

Not licensed here: official hosted services, enterprise verifiers, private
packs, marketplace scoring, certification marks, proprietary datasets,
benchmarks, commercial support, warranty, indemnity, or service-level
commitments. Those require separate agreements.

## Contributions

Inbound = outbound: contributions are accepted under the license of the files
they touch - `LicenseRef-AgentLintel-Free-Use-No-Resale-1.0` for core files
and `Apache-2.0` for AgentLintel-supplied adoption templates and examples:
`tools/agentlintel-cli/templates/**`, this repository's own `.agentlintel/**`,
this repository's own `.github/**`, and `.pre-commit-hooks.yaml`. See
[CONTRIBUTING.md](../CONTRIBUTING.md).
