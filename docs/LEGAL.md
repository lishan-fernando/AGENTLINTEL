# AgentLintel Legal Boundary

Summary only; license texts control. The root keeps one primary `LICENSE`.
Apache text lives in the CLI package so Apache templates ship with it without
extra root license tabs on GitHub.

## Licenses

| What | License | Text |
|---|---|---|
| **Core** — CLI source, spec, docs, and every file not carved out below | Functional Source License, Version 1.1, with Apache-2.0 future grant (SPDX: `FSL-1.1-ALv2`) | [LICENSE](../LICENSE) |
| **Adoption surface** — templates, `.agentlintel/**`, `.github/**`, `.pre-commit-hooks.yaml` | Apache License, Version 2.0 | [tools/agentlintel-cli/LICENSE-APACHE](../tools/agentlintel-cli/LICENSE-APACHE) |

Source files carry `SPDX-License-Identifier` headers. A file's header wins;
otherwise the table above wins.

## Free uses

- Run AgentLintel on personal, internal, or commercial codebases.
- Build and sell your own software with it. Your code, `.agentlintel/`
  contract, and CLI reports are yours; `init` scaffolds Apache-2.0 templates,
  so no fair-source restriction enters your repo.
- Read, modify, fork, and redistribute the source for any non-Competing Use,
  including internal forks, patches, review, research, and services for
  licensees.
- Implement and integrate the protocol; contract formats, templates, fixtures,
  and CI glue are Apache-2.0.

## Fair-source window limits

During each version's fair-source window, do not sell AgentLintel itself:
offering the CLI, a fork, or substantially the same product or hosted service
commercially is a Competing Use outside the license grant. Rebranding and
commercial redistribution are treated the same way. The AgentLintel name is
separately protected; see [TRADEMARKS.md](../TRADEMARKS.md).

## Future grant

`FSL-1.1-ALv2` contains an irrevocable future grant: **two years after each
version is made available, that version is additionally licensed under
Apache-2.0**, with no competing-use restriction. The fair-source window is a
head start, not an enclosure.

Releases up to and including `v2.0.0-alpha.4` were published under
Apache-2.0 and have since been withdrawn. Withdrawal is not revocation:
copies obtained while they were available remain licensed under Apache-2.0.

## Reserved commercial assets

Not licensed here: hosted services, enterprise verifiers, private packs,
marketplace scoring, certification marks, proprietary datasets, benchmarks,
commercial support, warranty, indemnity, or service-level commitments. Those
require separate agreements.

## Contributions

Inbound = outbound: contributions are accepted under the license of the files
they touch — including the future Apache-2.0 grant for FSL-covered files. See
[CONTRIBUTING.md](../CONTRIBUTING.md).
