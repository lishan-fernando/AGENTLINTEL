// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
// Focused kernel feature tests: suppression, fact checks, and empty scopes.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { verify, verifyFacts, runRulesOnFiles, applySuppression } = require('../src/lib/verify');
const { collectExemptionSpans } = require('../src/lib/engines');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const DEEP_IMPORT_RULE = [
  'version: 2',
  'rules:',
  '  - id: slice.no-deep-imports',
  '    severity: error',
  '    engine: regex',
  '    applies_to: ["**/*.ts"]',
  '    forbidden:',
  '      - "from\\\\s+[\'\\"](?:\\\\.\\\\./)*slices/[^/\'\\"]+/(application|domain)\\\\b"',
  '    message: "Deep imports forbidden."',
  '  - id: exemption.audited',
  '    severity: error',
  '    engine: exemptions',
  '    marker: "AGENTLINTEL-EXEMPT"',
  '    required_fields: [Reason, Approver, Expires, Owner, Decision]',
  '    within_lines: 5',
  '    excludes: ["**/*.md"]',
  '    message: "Exemptions must declare Reason, Approver, Expires, Owner."',
].join('\n');

test('a valid exemption marker suppresses the named rule within its span', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', DEEP_IMPORT_RULE);
  write(root, '.agentlintel/decisions/ADR-99-test-exemption.md', [
    '# ADR-99: Test exemption',
    '',
    'Accepted: 2026-07-09',
    '',
    'Decision:',
    '',
    'Authorize the bounded test exception.',
    '',
    'Authorizes-Exemption: {"rule":"slice.no-deep-imports","file":"a.ts","expires":"2099-01-01"}',
  ].join('\n'));
  write(root, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: slice.no-deep-imports',
    '// Reason: strangler seam',
    '// Approver: arch@example.com',
    '// Expires: 2099-01-01',
    '// Owner: team-core',
    '// Decision: ADR-99',
    "import { x } from 'slices/Billing/domain/rules';",
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  const v = result.rule_violations.find((x) => x.rule === 'slice.no-deep-imports');
  assert.ok(v, 'violation is still visible in JSON output');
  assert.strictEqual(v.exempted, true);
  assert.strictEqual(result.exempted_count, 1);
  assert.ok(!result.errors.some((e) => e.includes('slice.no-deep-imports')), 'suppressed violation is not an error');
});

test('an expired exemption suppresses nothing and fails exemption.audited', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', DEEP_IMPORT_RULE);
  write(root, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: slice.no-deep-imports',
    '// Reason: strangler seam',
    '// Approver: arch@example.com',
    '// Expires: 2020-01-01',
    '// Owner: team-core',
    '// Decision: ADR-99',
    "import { x } from 'slices/Billing/domain/rules';",
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('slice.no-deep-imports')), 'rule still fails');
  assert.ok(result.errors.some((e) => e.includes('expired')), 'expiry still fails the audit');
  assert.strictEqual(result.exempted_count, 0);
});

test('a marker for a different rule does not suppress', () => {
  const spans = collectExemptionSpans(
    { id: 'exemption.audited', engine: 'exemptions', within_lines: 5 },
    'a.ts',
    [
      '// AGENTLINTEL-EXEMPT: some.other-rule',
      '// Reason: r',
      '// Approver: a',
      '// Expires: 2099-01-01',
      '// Owner: o',
      '// Decision: ADR-99',
    ].join('\n'),
  );
  const violations = [{ rule: 'slice.no-deep-imports', file: 'a.ts', line: 6, message: 'm', severity: 'error' }];
  applySuppression(violations, spans);
  assert.strictEqual(violations[0].exempted, undefined);
});

test('exemption.audited itself is never suppressed', () => {
  const spans = [{ file: 'a.ts', rules: ['exemption.audited'], fromLine: 1, toLine: 10 }];
  const violations = [{ rule: 'exemption.audited', file: 'a.ts', line: 2, message: 'm', severity: 'error' }];
  applySuppression(violations, spans);
  assert.strictEqual(violations[0].exempted, undefined);
});

test('line_count_max, byte_count_max, file_absent, glob_count, pending', () => {
  const root = tmpDir();
  write(root, 'small.md', 'one\ntwo\n');
  write(root, 'slices/A/index.ts', 'export {}');
  const results = verifyFacts(root, {
    facts: [
      { id: 'lines-ok', claim: 'small', check: { type: 'line_count_max', path: 'small.md', max: 5 } },
      { id: 'lines-over', claim: 'small', check: { type: 'line_count_max', path: 'small.md', max: 1 } },
      { id: 'bytes-ok', claim: 'small', check: { type: 'byte_count_max', path: 'small.md', max: 1000 } },
      { id: 'bytes-over', claim: 'small', check: { type: 'byte_count_max', path: 'small.md', max: 2 } },
      { id: 'absent-ok', claim: 'gone', check: { type: 'file_absent', path: 'REPOSITORY-SPLIT.md' } },
      { id: 'absent-fail', claim: 'gone', check: { type: 'file_absent', path: 'small.md' } },
      { id: 'glob-ok', claim: 'one slice', check: { type: 'glob_count', pattern: 'slices/*/index.ts', min: 1 } },
      { id: 'glob-fail', claim: 'two slices', check: { type: 'glob_count', pattern: 'slices/*/index.ts', min: 2 } },
      { id: 'todo', claim: 'not yet checkable', check: { type: 'pending', note: 'write me' } },
    ],
  });
  assert.deepStrictEqual(results.map((r) => r.ok), [true, false, true, false, true, false, true, false, false]);
  assert.strictEqual(results[8].pending, true);
});

test('pending facts are warnings, not errors', () => {
  const root = tmpDir();
  write(root, '.agentlintel/facts.yaml', ['version: 2', 'facts:', '  - id: todo', '    claim: "later"', '    check: { type: pending, note: "replace with a machine check" }'].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('PENDING FACT')));
});

test('warning severity is non-blocking outside strict mode', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no.boom',
    '    severity: warning',
    '    engine: regex',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, 'src/a.ts', 'boom\n');

  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('RULE [no.boom]')), result.warnings.join('\n'));
  assert.ok(!result.errors.some((e) => e.includes('RULE [no.boom]')), result.errors.join('\n'));
});

const SCOPED_RULE = (extra) => [
  'version: 2',
  'rules:',
  '  - id: ghost.rule',
  '    severity: error',
  '    engine: regex',
  '    applies_to: ["nonexistent/**/*.xyzq"]',
  ...(extra ? [`    ${extra}`] : []),
  '    forbidden: ["boom"]',
  '    message: "never fires"',
].join('\n');

test('a rule matching zero files warns by default, fails with must_match: true, dormant with false', () => {
  for (const [extra, expectError, expectWarn, expectDormant] of [
    [null, false, true, []],
    ['must_match: true', true, false, []],
    ['must_match: false', false, false, ['ghost.rule']],
  ]) {
    const root = tmpDir();
    write(root, '.agentlintel/rules.yaml', SCOPED_RULE(extra));
    write(root, 'code.ts', 'export {}');
    const result = verify(root, { skipFixtures: true });
    assert.strictEqual(result.errors.some((e) => e.includes('RULE-SCOPE')), expectError, String(extra));
    assert.strictEqual(result.warnings.some((w) => w.includes('RULE-SCOPE')), expectWarn, String(extra));
    assert.deepStrictEqual(result.dormant_rules, expectDormant, String(extra));
  }
});

test('bad rule config fails the gate without aborting valid rules', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: bad.regex',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["["]',
    '    message: bad regex',
    '  - id: no.boom',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, 'src/a.ts', 'boom\n');

  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('RULE-CONFIG [bad.regex]')), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('RULE [no.boom]')), result.errors.join('\n'));
});

test('unknown rule engines are gate findings, not internal errors', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: typo.engine',
    '    severity: error',
    '    engine: regx',
    '    forbidden: ["boom"]',
    '    message: unknown engine',
  ].join('\n'));

  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("RULE-CONFIG [typo.engine] unknown engine 'regx'")), result.errors.join('\n'));
});

test('exemplar paths cannot escape the repository', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/exemplars.yaml', [
    'version: 2',
    'exemplars:',
    '  - id: outside',
    '    shape: service',
    '    path: ../outside',
    '    demonstrates: boundary behavior',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('path must stay inside the repository')), result.errors.join('\n'));
});

test('excluded files are skipped before file contents are read', () => {
  const root = tmpDir();
  write(root, 'ignored.ts', 'boom');
  const rulesDoc = {
    rules: [{
      id: 'skip.read',
      severity: 'error',
      engine: 'regex',
      applies_to: ['**/*.ts'],
      excludes: ['ignored.ts'],
      forbidden: ['boom'],
      message: 'must not read excluded files',
    }],
  };
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function patchedRead(file, ...args) {
    if (String(file).replace(/\\/g, '/').endsWith('/ignored.ts')) {
      throw new Error('excluded file was read');
    }
    return readFileSync.call(this, file, ...args);
  };
  try {
    const result = runRulesOnFiles(root, rulesDoc, ['ignored.ts']);
    assert.deepStrictEqual(result.violations, []);
  } finally {
    fs.readFileSync = readFileSync;
  }
});

test('free-text approval and an unbacked Decision cannot self-authorize an exemption', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', DEEP_IMPORT_RULE);
  write(root, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: slice.no-deep-imports',
    '// Reason: agent wants the gate green',
    '// Approver: definitely-a-human',
    '// Expires: 2099-01-01',
    '// Owner: candidate-agent',
    '// Decision: ADR-404',
    "import { x } from 'slices/Billing/domain/rules';",
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.exempted_count, 0);
  assert.ok(result.errors.some((error) =>
    error.includes('exemption.audited') && error.includes('not exactly authorized')),
  result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('slice.no-deep-imports')),
    result.errors.join('\n'));
});

test('required regex evidence is checked on full trees and skipped for partial scans', () => {
  const root = tmpDir();
  write(root, 'src/query.cs', 'public string CancellationReason { get; init; }');
  const rulesDoc = { rules: [{
    id: 'feature.read-surfaces',
    severity: 'error',
    engine: 'regex',
    applies_to: ['src/**'],
    required: ['CancellationReason', 'CancellationRequestedAt'],
    message: 'Expose cancellation metadata.',
  }] };

  const full = runRulesOnFiles(root, rulesDoc, ['src/query.cs']);
  assert.strictEqual(full.violations.length, 1);
  assert.match(full.violations[0].message, /CancellationRequestedAt/);

  const partial = runRulesOnFiles(root, rulesDoc, ['src/query.cs'], { partial: true });
  assert.deepStrictEqual(partial.violations, []);
});
