# Contributing

Read `AGENTS.md` first — its laws apply to humans too.

## Helpful non-code contributions

- Request a pilot if you have a repo where AI-agent architecture drift is
  already painful.
- Share a concrete drift story: what the agent changed, why it mattered, and
  how you caught it.
- Point out unclear README, install, licensing, or claim-boundary language.

Please do not paste secrets, customer data, private source code, or anything
your team would not want public. An anonymized story is useful.

## The bar

- **New rule:** rule entry in `.agentlintel/rules.yaml` + pass/fail fixtures
  in `.agentlintel/conformance/<id>/cases/` + engine tests, in the same PR.
  A rule without fixtures is rejected by `verify` itself.
- **New fact type or engine:** implementation + tests + a section in `SPEC.md`.
- **Anything that adds a seventh concept or an always-load file:** rejected.
  Open an issue arguing why the law should change instead.

## Before you push

```bash
cd tools/agentlintel-cli && npm install
npm test
node bin/agentlintel.js verify --dir ../.. --strict
```

CI runs exactly this.

## Licensing of contributions

Inbound = outbound. By submitting a contribution you license it under the
license of the files it modifies or creates — `FSL-1.1-ALv2` for the core,
`Apache-2.0` for the adoption surface (see
[LICENSE-POLICY.md](LICENSE-POLICY.md) for the boundary) — including, for
FSL-covered files, the future Apache-2.0 grant. Keep the SPDX header style of
the area you touch. Sign each commit off (`git commit -s`) to certify the
Developer Certificate of Origin (developercertificate.org) — that you have
the right to submit the work under these terms.
