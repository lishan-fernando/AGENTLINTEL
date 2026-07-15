// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
// LAW test: every rule in the kernel has fixtures and they are green.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readYaml } = require('../src/lib/io');
const { runFixtures } = require('../src/lib/verify');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-fixtures-'));
}

function write(root, rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const RULES = {
  rules: [{
    id: 'sample.rule',
    severity: 'error',
    engine: 'regex',
    applies_to: ['**/*.ts'],
    excludes: ['ignored/**'],
    forbidden: ['boom'],
    message: 'no boom',
  }],
};

test('all kernel rules have green conformance fixtures', () => {
  const rulesDoc = readYaml(path.join(REPO_ROOT, '.agentlintel', 'rules.yaml'));
  for (const rule of rulesDoc.rules) {
    assert.strictEqual(
      fs.existsSync(path.join(REPO_ROOT, '.agentlintel', 'conformance', rule.id, 'README.md')),
      false,
      `${rule.id} should rely on fixture cases, not per-rule README prose`,
    );
  }
  const results = runFixtures(REPO_ROOT, rulesDoc);
  assert.ok(results.length >= rulesDoc.rules.length, 'every rule should produce at least one fixture result');
  const failures = results.filter((r) => !r.ok);
  assert.deepStrictEqual(
    failures.map((f) => `${f.rule}/${f.case}: ${f.detail}`),
    [],
    'all fixtures must be green',
  );
});

test('fixtures must prove both acceptance and rejection with real scoped inputs', () => {
  const root = tmpDir();
  write(root, '.agentlintel/conformance/sample.rule/cases/pass/expected.yaml', 'violations: []\n');
  write(root, '.agentlintel/conformance/sample.rule/cases/pass/ignored/ok.ts', 'export {}\n');
  let failures = runFixtures(root, RULES).filter((result) => !result.ok);
  assert.ok(failures.some((failure) => failure.detail.includes('no file in the rule')));
  assert.ok(failures.some((failure) => failure.detail.includes('passing fixture')));
  assert.ok(failures.some((failure) => failure.detail.includes('failing fixture')));

  write(root, '.agentlintel/conformance/sample.rule/cases/pass/ok.ts', 'export {}\n');
  write(root, '.agentlintel/conformance/sample.rule/cases/fail/bad.ts', 'boom\n');
  write(root, '.agentlintel/conformance/sample.rule/cases/fail/expected.yaml', [
    'violations:',
    '  - rule: wrong.rule',
    '    file: bad.ts',
  ].join('\n'));
  failures = runFixtures(root, RULES).filter((result) => !result.ok);
  assert.ok(failures.some((failure) => failure.detail.includes("needs rule 'sample.rule'")));

  write(root, '.agentlintel/conformance/sample.rule/cases/fail/expected.yaml', [
    'violations:',
    '  - rule: sample.rule',
    '    file: bad.ts',
    '    messege_contains: boom',
  ].join('\n'));
  failures = runFixtures(root, RULES).filter((result) => !result.ok);
  assert.ok(failures.some((failure) => failure.detail.includes('invalid expectation')));

  write(root, '.agentlintel/conformance/sample.rule/cases/fail/expected.yaml', [
    'violations:',
    '  - rule: sample.rule',
    '    file: bad.ts',
  ].join('\n'));
  failures = runFixtures(root, RULES).filter((result) => !result.ok);
  assert.deepStrictEqual(failures, []);
});

test('fixtures evaluate required regex evidence across the whole case tree', () => {
  const root = tmpDir();
  const rules = { rules: [{
    id: 'required.rule',
    severity: 'error',
    engine: 'regex',
    applies_to: ['src/**'],
    required: ['QuerySurface', 'WebSurface'],
    message: 'Feature must reach both surfaces.',
  }] };
  const base = '.agentlintel/conformance/required.rule/cases';
  write(root, `${base}/pass/src/query.cs`, 'QuerySurface');
  write(root, `${base}/pass/src/web.cs`, 'WebSurface');
  write(root, `${base}/pass/expected.yaml`, 'violations: []\n');
  write(root, `${base}/fail/src/query.cs`, 'QuerySurface');
  write(root, `${base}/fail/expected.yaml`, [
    'violations:',
    '  - rule: required.rule',
    '    file: src/query.cs',
    '    message_contains: WebSurface',
  ].join('\n'));

  const failures = runFixtures(root, rules).filter((result) => !result.ok);
  assert.deepStrictEqual(failures, []);
});

test('external fixtures replay live fail-closed exit and parser semantics', () => {
  const root = tmpDir();
  const rules = { rules: [{
    id: 'external.rule',
    severity: 'error',
    engine: 'external',
    adapter: 'jsonl',
    evidence: ['checker.js'],
    run: 'tool',
    message: 'external finding',
  }] };
  const base = '.agentlintel/conformance/external.rule/cases/pass';
  write(root, `${base}/status.txt`, '1\n');
  write(root, `${base}/expected.yaml`, 'violations: []\n');
  let result = runFixtures(root, rules).find((entry) => entry.case === 'pass');
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /unexpected violation: \(engine\):0/);

  write(root, `${base}/status.txt`, '0\n');
  write(root, `${base}/output.jsonl`, 'fatal: checker crashed\n');
  result = runFixtures(root, rules).find((entry) => entry.case === 'pass');
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /unexpected violation: \(engine\):0/);

  write(root, `${base}/output.jsonl`, '{bad json\n');
  result = runFixtures(root, rules).find((entry) => entry.case === 'pass');
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /unexpected violation: \(engine\):0/);

  write(root, `${base}/output.jsonl`, '{"message":{"not":"a string"}}\n');
  result = runFixtures(root, rules).find((entry) => entry.case === 'pass');
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /unexpected violation: \(engine\):0/);

  const depRules = { rules: [{
    id: 'deps.rule', severity: 'error', engine: 'external', adapter: 'dependency-cruiser', evidence: ['checker.js'], run: 'tool',
    message: 'dependency policy failed',
  }] };
  const depBase = '.agentlintel/conformance/deps.rule/cases/pass';
  write(root, `${depBase}/status.txt`, '0\n');
  write(root, `${depBase}/output.jsonl`, '{"summary":{"violations":{}}}\n');
  write(root, `${depBase}/expected.yaml`, 'violations: []\n');
  result = runFixtures(root, depRules).find((entry) => entry.case === 'pass');
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /unexpected violation: \(engine\):0/);
});

test('fixture case directories cannot be symlinked to mutable evidence', (t) => {
  const root = tmpDir();
  const target = path.join(root, 'ordinary-content');
  write(target, 'pass/expected.yaml', 'violations: []\n');
  write(target, 'pass/ok.ts', 'export {}\n');
  const cases = path.join(root, '.agentlintel', 'conformance', 'sample.rule', 'cases');
  fs.mkdirSync(path.dirname(cases), { recursive: true });
  try {
    fs.symlinkSync(target, cases, 'junction');
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.code || error.message}`);
    return;
  }
  const result = runFixtures(root, RULES);
  assert.ok(result.some((entry) => !entry.ok && entry.detail.includes('regular in-repository cases directory')));
});
