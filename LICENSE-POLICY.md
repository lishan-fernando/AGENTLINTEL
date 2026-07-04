# AgentLintel License Policy

One page: which license covers which files, and what you may do. This page is
a summary and a boundary map, not legal advice; the license texts control.

## The two licenses

| What | License | Text |
|---|---|---|
| **AgentLintel itself** — the CLI source (`tools/agentlintel-cli/bin`, `src`, `test`), `SPEC.md`, `README.md`, `docs/`, and every file not carved out below | Functional Source License, Version 1.1, with Apache-2.0 future grant (SPDX: `FSL-1.1-ALv2`) | [LICENSE](LICENSE) |
| **The adoption surface** — everything designed to be copied into *your* repository or CI: `tools/agentlintel-cli/templates/**`, this repo's own contract `.agentlintel/**`, `.github/**`, `.pre-commit-hooks.yaml` | Apache License, Version 2.0 | [LICENSE-APACHE](LICENSE-APACHE) |

Source files carry `SPDX-License-Identifier` headers. A file's header wins;
absent a header, the table above wins.

## What you may do, free, without asking

- **Use AgentLintel.** Run `init`, `verify`, and `report` on any codebase —
  personal, internal, or commercial — forever.
- **Build and sell your own software with it.** Your code, your
  `.agentlintel/` contract, and the reports the CLI generates are yours.
  AgentLintel claims no rights over your repository or the tool's output, and
  everything `init` scaffolds into your repo comes from Apache-2.0 templates,
  so no fair-source restriction enters your project.
- **Read, modify, fork, and redistribute the source** for any purpose that is
  not a Competing Use — internal forks, patches, security review,
  non-commercial education and research, and professional services for
  licensees are all expressly permitted.
- **Implement and integrate the protocol.** The contract formats, templates,
  fixtures, and CI glue are Apache-2.0 precisely so integrations and
  independent implementations stay easy.

## What you may not do (during each version's fair-source window)

- **Sell AgentLintel itself.** Offering the CLI, a fork of it, or a product
  or hosted/managed service with substantially the same functionality, on a
  commercial basis, is a Competing Use outside the license grant.
- **Rebrand and commercially redistribute it.** The same restriction — and
  the AgentLintel name is separately protected regardless of license; see
  [TRADEMARKS.md](TRADEMARKS.md).

## Every release becomes open source

`FSL-1.1-ALv2` contains an irrevocable future grant: **two years after each
version is made available, that version is additionally licensed under
Apache-2.0**, with no competing-use restriction. The fair-source window is a
head start, not an enclosure.

Releases up to and including `v2.0.0-alpha.4` were published under
Apache-2.0 and have since been withdrawn. Withdrawal is not revocation:
copies obtained while they were available remain licensed under Apache-2.0.

## Reserved commercial assets

Not in this repository and not licensed by it: hosted AgentLintel services,
enterprise verifier implementations, private or premium rule packs,
marketplace scoring, certification programs and marks, proprietary datasets
and benchmarks, and commercial support, warranty, indemnity, or service-level
commitments. Those are offered, if at all, under separate agreements.

## Contributions

Inbound = outbound: contributions are accepted under the license of the files
they touch — including the future Apache-2.0 grant for FSL-covered files. See
[CONTRIBUTING.md](CONTRIBUTING.md).
