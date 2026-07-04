# Publishing

## npm (@agentlintel/cli)

```bash
cd tools/agentlintel-cli
npm install
npm test                                      # package, fixtures, CLI, workspace, reports
node bin/agentlintel.js verify --dir ../..    # gate must pass on this repo
npm pack --dry-run --json                     # package shape smoke test
```

Versioning: the CLI and the spec version together (SPEC.md states the
version). Breaking changes to file formats bump the major and require a
migration note in CHANGELOG.md.

GitHub Releases are the primary distribution path until npm is configured:
push a `v*` tag matching `tools/agentlintel-cli/package.json` and the release
workflow attaches `agentlintel-cli.tgz` under a stable asset name. If
`NPM_TOKEN` exists, the same workflow publishes `@agentlintel/cli`; otherwise
the registry step skips cleanly and the release tarball remains installable.

Post-merge release checklist:

```bash
VERSION="v$(node -p 'require("./tools/agentlintel-cli/package.json").version')"
git tag "$VERSION"
git push origin "$VERSION"
git tag -f v2 "$VERSION"
git push --force origin v2
git ls-remote --tags origin "$VERSION" v2
```

Do not move versioned alpha tags after publication. Keep branch protection
configured in GitHub so the `repository-checks.yml` gate is required on `main`.

## GitHub Action

Tag the repo (`v2`, `v2.x.y`); adopters reference
`lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2`.

## Skills

`.agentlintel/skills/*/SKILL.md` follow the Agent Skills spec and can be
published to skill marketplaces as-is. Keep descriptions under 200 chars;
they are the only text loaded until invocation.
