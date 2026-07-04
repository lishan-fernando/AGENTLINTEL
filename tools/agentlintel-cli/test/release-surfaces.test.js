// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('release workflow preserves the tested tarball distribution path', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /npm test --prefix tools\/agentlintel-cli/);
  assert.match(yml, /agentlintel\.js verify --dir \. --strict/);
  assert.match(yml, /working-directory: tools\/agentlintel-cli/);
  assert.match(yml, /npm pack --dry-run --json/);
  assert.match(yml, /agentlintel-cli\.tgz/);
  assert.match(yml, /npm publish --access public/);
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
});

test('publishing docs match the release workflow and action coordinates', () => {
  const docs = read('docs/PUBLISHING.md');
  assert.match(docs, /npm pack --dry-run --json/);
  assert.match(docs, /agentlintel-cli\.tgz/);
  assert.match(docs, /lishan-fernando\/AGENTLINTEL\/\.github\/actions\/agentlintel@v2/);
});

test('adopter snippets pin the current package version where they name a release', () => {
  const version = require('../package.json').version;
  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', '.pre-commit-hooks.yaml']) {
    assert.match(read(rel), new RegExp(`v${version.replace(/\./g, '\\.')}`), `${rel} must mention current package version`);
  }
});
