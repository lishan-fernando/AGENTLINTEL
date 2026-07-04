// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { verify } = require('../src/lib/verify');

// Hermetic: temp repos here have no origin; a leaked GITHUB_BASE_REF from a
// pull_request run would degrade the ratchet to a warning (see v2-governance).
delete process.env.GITHUB_BASE_REF;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-benchmark-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function git(root, command) {
  return execSync(`git ${command}`, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

function initGit(root) {
  git(root, 'init -q');
  git(root, 'config user.email benchmark@example.invalid');
  git(root, 'config user.name benchmark');
}

const RULES = [
  'version: 2',
  'rules:',
  '  - id: seed.no-secret',
  '    severity: error',
  '    engine: regex',
  '    applies_to: ["src/**/*.ts"]',
  '    forbidden: ["SECRET_VALUE"]',
  '    message: "Seeded secret marker must not ship."',
  '  - id: exemption.audited',
  '    severity: error',
  '    engine: exemptions',
  '    marker: "AGENTLINTEL-EXEMPT"',
  '    required_fields: [Reason, Approver, Expires, Owner]',
  '    within_lines: 5',
  '    excludes: ["**/*.md"]',
  '    message: "Exemptions must be complete and unexpired."',
].join('\n');

test('synthetic benchmark seed catches stale facts, rule drift, guard drift, and expired exemptions', () => {
  const root = tmpDir();
  initGit(root);
  write(root, '.agentlintel/rules.yaml', RULES);
  write(root, '.agentlintel/facts.yaml', [
    'version: 2',
    'facts:',
    '  - id: required-file',
    '    claim: "src/required.ts exists"',
    '    check: { type: path_exists, path: src/required.ts }',
  ].join('\n'));
  write(root, '.agentlintel/guard.json', JSON.stringify({ version: 2, zones: [{ id: 'src-only', allow: ['src/**', '.agentlintel/**'] }], forbidden: [] }, null, 2));
  write(root, 'src/a.ts', 'export const clean = true;\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');

  write(root, 'src/a.ts', [
    '// AGENTLINTEL-EXEMPT: seed.no-secret',
    '// Reason: benchmark seed',
    '// Approver: architecture',
    '// Expires: 2020-01-01',
    '// Owner: platform',
    'export const leaked = "SECRET_VALUE";',
  ].join('\n'));
  write(root, 'outside.md', 'out of scope\n');

  const full = verify(root, { strict: true, skipFixtures: true });
  assert.ok(full.errors.some((e) => e.includes('STALE FACT [required-file]')), full.errors.join('\n'));
  assert.ok(full.errors.some((e) => e.includes('RULE [seed.no-secret]')), full.errors.join('\n'));
  assert.ok(full.errors.some((e) => e.includes('expired')), full.errors.join('\n'));
  assert.ok(full.errors.some((e) => e.includes('GUARD [guard.zone] outside.md')), full.errors.join('\n'));

  const factsOnly = verify(root, { strict: true, skipFixtures: true, bail: true });
  assert.ok(factsOnly.errors.some((e) => e.includes('STALE FACT [required-file]')), factsOnly.errors.join('\n'));
  assert.ok(!factsOnly.errors.some((e) => e.includes('RULE [seed.no-secret]')), 'facts-only control misses code-rule family');
  assert.ok(!factsOnly.errors.some((e) => e.includes('GUARD [guard.zone]')), 'facts-only control misses guard family');
});

test('synthetic benchmark seed catches missing fixtures as a rule-quality failure', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', RULES);
  write(root, 'src/a.ts', 'export const clean = true;\n');
  const full = verify(root, {});
  assert.ok(full.errors.some((e) => e.includes('FIXTURE [seed.no-secret/(none)]') && e.includes('LAW VIOLATION')), full.errors.join('\n'));
  assert.ok(full.errors.some((e) => e.includes('FIXTURE [exemption.audited/(none)]') && e.includes('LAW VIOLATION')), full.errors.join('\n'));

  const withoutFixtures = verify(root, { skipFixtures: true });
  assert.ok(!withoutFixtures.errors.some((e) => e.includes('LAW VIOLATION')), 'skip-fixtures control misses rule-quality family');
});

test('synthetic benchmark seed catches rule weakening without an ADR', () => {
  const root = tmpDir();
  initGit(root);
  write(root, '.agentlintel/rules.yaml', RULES);
  write(root, 'src/a.ts', 'export const clean = true;\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');

  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: seed.no-secret',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.ts"]',
    '    forbidden: []',
    '    message: "Seeded secret marker must not ship."',
  ].join('\n'));

  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('RATCHET') && e.includes('seed.no-secret')), result.errors.join('\n'));
});
