// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const CLI_PACKAGE = require('../package.json');
const ROOT_PACKAGE = require('../../../package.json');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('release workflow preserves the tested tarball distribution path', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /npm run release:check --prefix tools\/agentlintel-cli/);
  assert.match(yml, /cache-dependency-path: tools\/agentlintel-cli\/package-lock\.json/);
  assert.match(CLI_PACKAGE.scripts['test:ci'], /npm run check && npm test/);
  assert.match(CLI_PACKAGE.scripts['release:check'], /npm run test:ci && npm run verify:strict && npm run pack:dry-run/);
  assert.match(CLI_PACKAGE.scripts['verify:strict'], /agentlintel\.js verify --dir \.\.\/\.\. --strict/);
  assert.match(CLI_PACKAGE.scripts['pack:dry-run'], /npm pack --dry-run --json/);
  assert.match(CLI_PACKAGE.scripts.prepublishOnly, /npm run release:check/);
  assert.match(yml, /agentlintel-cli\.tgz/);
  assert.match(yml, /npm publish --access public/);
});

test('release workflow publishes deliberately and with provenance (ADR-013)', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /id-token: write/, 'OIDC permission is required for provenance and trusted publishing');
  assert.match(yml, /environment: NPM/, 'publish credentials are scoped to the tag-restricted NPM environment');
  assert.match(yml, /vars\.NPM_PUBLISH == 'true'/, 'npm publishing must be an explicit variable decision');
  assert.match(yml, /npm publish --access public --provenance --tag "\$DIST_TAG"/, 'publishes carry provenance and an explicit dist-tag (prereleases must not land on latest)');
  assert.match(yml, /sha256sum agentlintel-cli\.tgz/, 'release assets ship checksums');
});

test('CLI bin entries survive npm publish normalization', () => {
  const bin = CLI_PACKAGE.bin;
  assert.ok(bin && Object.keys(bin).length > 0, 'the CLI must expose a bin');
  for (const [name, target] of Object.entries(bin)) {
    assert.ok(!target.startsWith('./'), `bin["${name}"]: npm >= 11.17 treats "./"-prefixed targets as invalid and strips the entry at publish`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', target)), `bin["${name}"] target ${target} must exist`);
  }
});

test('repository CI keeps the strict AgentLintel merge gate', () => {
  const yml = read('.github/workflows/repository-checks.yml');
  assert.match(yml, /pull_request:/);
  assert.match(yml, /agentlintel\.js verify --dir \. --strict/);
  assert.match(yml, /strict: "true"/);
  assert.match(yml, /git ls-files -z -- \*\.sh/);
  assert.doesNotMatch(yml, /\.agentlintel\/templates\/agents-verify\.sh/);
  assert.doesNotMatch(yml, /exemplar-slice\/agents\/verify/);
});

test('repository CI tests the support claims, not just the happy path (ADR-013)', () => {
  const yml = read('.github/workflows/repository-checks.yml');
  assert.match(yml, /windows-latest/, 'the CLI is developed on Windows; CI must test it');
  assert.match(yml, /macos-latest/);
  assert.match(yml, /"18"/, 'engines says node >=18, so 18 is tested, not asserted');
  assert.match(yml, /ci-ok/, 'branch protection targets the single aggregation check');
  assert.match(yml, /permissions:\s*\n\s*contents: read/, 'CI runs with a read-only token');
  assert.match(yml, /npm run test:ci --prefix tools\/agentlintel-cli/, 'matrix CI uses the package-owned test script');
  assert.match(yml, /cache-dependency-path: tools\/agentlintel-cli\/package-lock\.json/, 'npm cache keys off the committed CLI lockfile');
});

test('CI surfaces pin third-party actions to commit SHAs (ADR-013)', () => {
  const surfaces = [
    '.github/workflows/release.yml',
    '.github/workflows/repository-checks.yml',
    '.github/actions/agentlintel/action.yml',
  ];
  for (const rel of surfaces) {
    const uses = read(rel)
      .split('\n')
      .filter((line) => !line.trim().startsWith('#')) // usage examples in comments are adopter docs
      .flatMap((line) => [...line.matchAll(/uses:\s*(\S+)/g)])
      .map((m) => m[1]);
    assert.ok(uses.length > 0, `${rel} must reference at least one action`);
    for (const ref of uses) {
      if (ref.startsWith('./')) continue; // this repo's own composite action
      assert.match(ref, /@[0-9a-f]{40}$/, `${rel}: "${ref}" must pin a 40-char commit SHA, not a floating tag`);
    }
  }
});

test('CLI dependencies install from the committed lockfile in CI (ADR-013)', () => {
  assert.ok(!Object.prototype.hasOwnProperty.call(ROOT_PACKAGE, 'workspaces'), 'root package.json must stay a script wrapper, not an npm workspace root');
  assert.match(ROOT_PACKAGE.scripts.ci, /npm ci --no-audit --no-fund --prefix tools\/agentlintel-cli/, 'root ci wrapper installs from the CLI lockfile');
  assert.match(ROOT_PACKAGE.scripts['release:check'], /npm run release:check --prefix tools\/agentlintel-cli/, 'root release check delegates to the publishable package');
  assert.ok(!fs.existsSync(path.join(REPO, 'package-lock.json')), 'root package-lock.json must not be generated or committed');
  assert.ok(
    fs.existsSync(path.join(REPO, 'tools/agentlintel-cli/package-lock.json')),
    'tools/agentlintel-cli/package-lock.json must be committed'
  );
  for (const rel of ['.github/workflows/release.yml', '.github/workflows/repository-checks.yml', '.github/actions/agentlintel/action.yml']) {
    assert.match(read(rel), /npm ci /, `${rel} must install with npm ci (lockfile), not npm install`);
  }
});

test('GitHub Action remains fork-safe and command-bounded', () => {
  const action = read('.github/actions/agentlintel/action.yml');
  assert.match(action, /verify\|report/);
  assert.match(action, /default: "true"/);
  assert.match(action, /IS_FORK/);
  assert.match(action, /args\+=\(--no-run\)/);
  assert.match(action, /GITHUB_STEP_SUMMARY/);
});

test('Copilot adapter is versioned and review-aware', () => {
  const instructions = read('tools/agentlintel-cli/templates/adapters/copilot.instructions.md');
  assert.match(instructions, /copilot-code-review@2/);
  assert.match(instructions, /\.agentlintel\/rules\.yaml/);
  assert.match(instructions, /For code review/);
  assert.match(instructions, /verify --strict/);
});

test('fast local hook keeps the token-lean agent-loop shape', () => {
  const hook = read('tools/agentlintel-cli/templates/hooks/verify-hook.sh');
  assert.match(hook, /verify --diff --quiet --bail --no-run --skip-fixtures/);
  assert.match(hook, /exit 2/);
  assert.match(hook, /GATE FAILED/);
  const preToolUse = read('tools/agentlintel-cli/templates/hooks/pretooluse-hook.sh');
  assert.match(preToolUse, /Edit\|Write\|MultiEdit/);
  assert.match(preToolUse, /verify --diff --quiet --bail --no-run --skip-fixtures/);
  assert.match(preToolUse, /exit 2/);
});

test('publishing docs match the release workflow and action coordinates', () => {
  const docs = read('docs/PUBLISHING.md');
  assert.match(docs, /npm ci --no-audit --no-fund/);
  assert.match(docs, /npm run release:check/);
  assert.match(docs, /npm pack --dry-run --json/);
  assert.match(docs, /agentlintel-cli\.tgz/);
  assert.match(docs, /lishan-fernando\/AGENTLINTEL\/\.github\/actions\/agentlintel@v2/);
});

test('adopter snippets pin the current package version where they name a release', () => {
  const version = require('../package.json').version;
  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', '.pre-commit-hooks.yaml']) {
    assert.ok(read(rel).includes(`v${version}`), `${rel} must mention current package version`);
  }
});
