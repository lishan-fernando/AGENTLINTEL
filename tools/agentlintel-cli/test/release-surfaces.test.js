// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const REPO = path.join(__dirname, '..', '..', '..');
const CLI_PACKAGE = require('../package.json');
const ROOT_PACKAGE = require('../../../package.json');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('release workflow preserves the tested tarball distribution path', () => {
  const yml = read('.github/workflows/release.yml');
  const workflow = YAML.parse(yml);
  const checkout = workflow.jobs.release.steps.find((step) =>
    typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'));
  assert.ok(checkout, 'release workflow must check out the tagged source');
  assert.strictEqual(checkout.with['fetch-depth'], 0, 'the strict release ratchet needs the tag parent/history locally');
  assert.match(yml, /npm run release:check --prefix tools\/agentlintel-cli/);
  assert.match(yml, /cache-dependency-path: tools\/agentlintel-cli\/package-lock\.json/);
  assert.match(CLI_PACKAGE.scripts['test:ci'], /npm run check && npm test/);
  assert.match(CLI_PACKAGE.scripts['release:check'], /npm run test:ci && npm run verify:strict && npm run pack:dry-run/);
  assert.match(CLI_PACKAGE.scripts['verify:strict'], /agentlintel\.js verify --dir \.\.\/\.\. --strict/);
  assert.match(CLI_PACKAGE.scripts['pack:dry-run'], /npm pack --dry-run --json/);
  assert.match(CLI_PACKAGE.scripts.prepublishOnly, /npm run release:check/);
  assert.match(yml, /agentlintel-cli\.tgz/);
  assert.match(yml, /npm publish --access public/);

  const steps = workflow.jobs.release.steps;
  const uploadIndex = steps.findIndex((step) => step.name === 'Create GitHub Release with tarball');
  const cleanupIndex = steps.findIndex((step) => step.name === 'Remove release artifacts before package lifecycle checks');
  const publishIndex = steps.findIndex((step) => step.name === 'Publish to npm with provenance');
  assert.ok(uploadIndex >= 0 && cleanupIndex > uploadIndex && publishIndex > cleanupIndex,
    'temporary release assets must be removed after upload and before prepublishOnly reruns byte budgets');
  assert.match(steps[cleanupIndex].run, /rm -f tools\/agentlintel-cli\/agentlintel-cli\.tgz/);
  assert.match(steps[cleanupIndex].run, /rm -f tools\/agentlintel-cli\/agentlintel-cli\.tgz\.sha256/);
});

test('release workflow publishes deliberately and with provenance (ADR-013)', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /id-token: write/, 'OIDC permission is required for provenance and trusted publishing');
  assert.match(yml, /environment: NPM/, 'publish credentials are scoped to the tag-restricted NPM environment');
  assert.match(yml, /vars\.NPM_PUBLISH == 'true'/, 'npm publishing must be an explicit variable decision');
  assert.match(yml, /npm publish --access public --provenance --tag "\$DIST_TAG"/, 'publishes carry provenance and an explicit dist-tag (prereleases must not land on latest)');
  assert.match(yml, /npm install -g npm@11\.5\.1 --no-audit --no-fund/, 'the credentialed publisher must use an exact reviewed npm CLI, not a floating major');
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
  assert.match(yml, /fetch-depth: 0/, 'the PR gate needs a local base ref; the CLI never fetches');
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

test('verification is local-only and never fetches Git refs', () => {
  const source = read('tools/agentlintel-cli/src/lib/verify.js');
  assert.doesNotMatch(source, /["']fetch["']/, 'the CLI must not make hidden network writes');
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
  const runStep = YAML.parse(action).runs.steps.find((step) => step.name === 'Run agentlintel verify');
  assert.ok(runStep, 'the AgentLintel run step must exist');
  assert.doesNotMatch(runStep.run, /\$\{\{\s*inputs\./, 'untrusted inputs must not be interpolated into the shell script');
  assert.match(action, /verify\|report/);
  assert.match(action, /default: "true"/);
  assert.match(action, /IS_UNTRUSTED/);
  assert.match(action, /AGENTLINTEL_BASE/);
  assert.match(runStep.run, /AGENTLINTEL_EVENT.*pull_request_target/);
  assert.match(runStep.run, /comparison base/);
  assert.match(action, /pull_request\.head\.repo\.fork == true/);
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
  assert.match(hook, /CLI not found/);
  assert.ok(!fs.existsSync(path.join(REPO, 'tools/agentlintel-cli/templates/hooks/pretooluse-hook.sh')));
});

test('base-branch CODEOWNERS protects the contract and verifier', () => {
  const owners = read('.github/CODEOWNERS');
  for (const protectedPath of [
    '/AGENTS.md',
    '/SPEC.md',
    '/.agentlintel/',
    '/.agents/skills/',
    '/.github/',
    '/tools/agentlintel-cli/',
  ])
    assert.match(owners, new RegExp(`^${protectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'm'));
});

test('publishing docs match the release workflow and action coordinates', () => {
  const docs = read('docs/PUBLISHING.md');
  const version = require('../package.json').version;
  assert.match(docs, /npm ci --no-audit --no-fund/);
  assert.match(docs, /npm run release:check/);
  assert.match(docs, /npm pack --dry-run --json/);
  assert.match(docs, /npm i -D @agentlintel\/cli@alpha/);
  assert.match(docs, /agentlintel-cli\.tgz/);
  assert.ok(docs.includes(
    `lishan-fernando/AGENTLINTEL/.github/actions/agentlintel@v${version}`,
  ));
});

test('adopter snippets pin the current package version where they name a release', () => {
  const version = require('../package.json').version;
  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', '.pre-commit-hooks.yaml']) {
    assert.ok(read(rel).includes(`v${version}`), `${rel} must mention current package version`);
  }
});

test('pre-commit installs the CLI it invokes', () => {
  const version = require('../package.json').version;
  const hooks = YAML.parse(read('.pre-commit-hooks.yaml'));
  const verifyHook = hooks.find((hook) => hook.id === 'agentlintel-verify');
  assert.ok(verifyHook);
  assert.ok(
    verifyHook.additional_dependencies.includes(
      `https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v${version}/agentlintel-cli.tgz`,
    ),
    'language: node hooks need the exact release CLI in their isolated environment',
  );
  assert.deepStrictEqual(verifyHook.stages, ['pre-commit'], 'the no-base fast path must not claim pre-push coverage');
});
