# Contributing

Read `AGENTS.md` first — its laws apply to humans too.

## Helpful non-code contributions

- Share a sanitized drift example: what the agent changed, why it mattered,
  and how you caught it.
- Point out unclear README, install, licensing, or claim-boundary language.

Please do not paste secrets, customer data, private source code, sensitive
adoption context, or anything your team would not want public.

## The bar

- **New rule:** rule entry in `.agentlintel/rules.yaml` + pass/fail fixtures
  in `.agentlintel/conformance/<id>/cases/` + engine tests, in the same PR.
  A rule without fixtures is rejected by `verify` itself.
- **New fact type or engine:** implementation + tests + a section in `SPEC.md`.
- **Anything that adds a seventh concept or an always-load file:** rejected.
  Open an issue arguing why the law should change instead.

## Before you push

```bash
cd tools/agentlintel-cli && npm ci --no-audit --no-fund
npm test
node bin/agentlintel.js verify --dir ../.. --strict --base <target-sha>
```

Replace `<target-sha>` with the actual target-branch commit and check out full
history first. CI derives the pull-request base SHA from the event.

## Licensing of contributions

Inbound = outbound. By submitting a contribution you license it under the
license of the files it modifies or creates -
`LicenseRef-AgentLintel-Free-Use-No-Resale-1.0` for the core, `Apache-2.0`
for AgentLintel-supplied adoption templates and examples:
`tools/agentlintel-cli/templates/**`, this repository's own `.agentlintel/**`,
this repository's own `.agents/skills/**`, `.github/**`, and
`.pre-commit-hooks.yaml` (see
[docs/LEGAL.md](docs/LEGAL.md) for the boundary). Keep the SPDX header style
of the area you touch. Sign each commit off (`git commit -s`) to certify the
Developer Certificate of Origin (developercertificate.org) - that you have the
right to submit the work under these terms.
