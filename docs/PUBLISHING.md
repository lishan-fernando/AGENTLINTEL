# Publishing

Distribution has three surfaces, all driven by one tag push: the npm registry
(`@agentlintel/cli`, provenance-attested, primary adopter install path), a
GitHub Release tarball under a stable name (exact-version or registry-free
fallback), and the GitHub Action tag (`v2`).
The release workflow (`.github/workflows/release.yml`) refuses to ship
anything the gate has not passed.

## What a tag push does

Push a `v*` tag matching `tools/agentlintel-cli/package.json` and the
workflow, in order:

1. Installs from the committed lockfile (`npm ci`) and rejects a tag that
   does not match the package version.
2. Runs `npm run release:check` for parse checks, the full suite,
   `agentlintel verify --strict`, and `npm pack --dry-run --json` — the gate
   must be green to release.
3. Packs the tarball, writes a `sha256` checksum, and attaches both to the
   GitHub Release under stable names (`agentlintel-cli.tgz`,
   `agentlintel-cli.tgz.sha256`).
4. Publishes `@agentlintel/cli` to npm with provenance attestation — if and
   only if the `NPM_PUBLISH` variable on the `NPM` deployment environment is
   `"true"`. Publishing is an explicit decision, never an inference from
   which secrets happen to exist (ADR-013).

Adopters install the current alpha from npm:

```bash
npm i -D @agentlintel/cli@alpha
```

Adopters who need an exact artifact or cannot use the registry install the
GitHub Release tarball:

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/latest/download/agentlintel-cli.tgz
```

## Release checklist (every release)

Versioning: the CLI and the spec version together (SPEC.md states the
version). Breaking changes to file formats bump the major and require a
migration note in CHANGELOG.md.

1. Bump the version in `tools/agentlintel-cli/package.json` and
   `package.json` (root), and update the version pins in `README.md`,
   `tools/agentlintel-cli/README.md`, and `.pre-commit-hooks.yaml` — the
   release-surfaces test fails if a pinned snippet lags. During prerelease,
   keep adopter docs on `@agentlintel/cli@alpha`; promote the unqualified npm
   install only when `latest` is intentionally current.
2. Add the CHANGELOG.md entry.
3. Verify locally what CI verifies:

```bash
cd tools/agentlintel-cli
npm ci --no-audit --no-fund                   # install from the committed CLI lockfile
npm run release:check                         # parse, tests, strict gate, package dry-run
```

4. Merge through the `ci-ok` gate, then tag:

```bash
VERSION="v$(node -p 'require("./tools/agentlintel-cli/package.json").version')"
git tag "$VERSION"
git push origin "$VERSION"
git tag -f v2 "$VERSION"
git push --force origin v2
git ls-remote --tags origin "$VERSION" v2
```

Do not move versioned alpha tags after publication. Keep branch protection
configured in GitHub so the `ci-ok` check from `repository-checks.yml` is
required on `main`.

## npm one-time setup (account side)

The pipeline is ready before the account is. These steps happen on
npmjs.com and in the GitHub repo settings, in this order:

1. **Harden the npm account.** Enable two-factor authentication
   (npmjs.com → account settings → Two-Factor Authentication, authenticator
   app). A public package published from an account without 2FA is a
   supply-chain incident waiting for a phish.
2. **Claim the scope.** Create the free `agentlintel` organization
   (npmjs.com → avatar menu → Add Organization → *Unlimited public
   packages*). This owns the `@agentlintel/*` scope that
   `tools/agentlintel-cli/package.json` already names. If the name is taken,
   choosing a new scope means updating both `package.json` names, this file,
   and the READMEs in the same PR.
3. **Bootstrap the first publish (token path).** npm's trusted publishing
   is configured per package, so the very first publish authenticates with a
   token:
   - Generate a *Granular Access Token* (account settings → Access Tokens):
     read/write, scoped to the `@agentlintel` scope only, short expiry
     (30 days — it exists for one release).
   - GitHub repo → Settings → Environments → `NPM` (deployments restricted
     to `v*` tags; the release job declares `environment: NPM`): save the
     token as the `NPM_TOKEN` environment secret, and set the environment
     variable `NPM_PUBLISH` to `true`.
   - Push the release tag. The workflow publishes with
     `npm publish --access public --provenance`.
4. **Switch to tokenless (trusted publishing).** On npmjs.com →
   `@agentlintel/cli` → Settings → Trusted Publisher: GitHub Actions,
   owner `lishan-fernando`, repository `AGENTLINTEL`, workflow
   `release.yml`, environment `NPM`. Then:
   - Delete the `NPM_TOKEN` environment secret and revoke the npm token.
   - In the package's publishing access settings, require two-factor
     authentication or automation and disallow classic tokens.
   - From now on the workflow authenticates via GitHub OIDC; there is no
     long-lived credential to compromise, and provenance is attested on every
     release.
5. **Tell adopters.** During prerelease, make
   `npm i -D @agentlintel/cli@alpha` the primary install path. Promote
   `npm i -D @agentlintel/cli` only when the npm `latest` tag is intentionally
   current, usually at a stable release. Keep the GitHub Release tarball as the
   canonical exact-version and registry-free fallback (mind the README byte
   budget, ADR-011).

## GitHub Action

Tag the repo (`v2`, `v2.x.y`); adopters reference
`lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v2`.

## Skills

`.agentlintel/skills/*/SKILL.md` follow the Agent Skills spec and can be
published to skill marketplaces as-is. Keep descriptions under 200 chars;
they are the only text loaded until invocation.
