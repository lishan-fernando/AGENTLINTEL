// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { verify, detectRuleWeakening } = require('../src/lib/verify');
const {
  tmpDir, write, git, noNewRepo, NO_NEW_RULES, RATCHET_BASE_RULES,
} = require('./governance-helpers');

test('no-new enforcement keeps legacy findings visible and blocks only introduced debt', () => {
  const { root, base } = noNewRepo();
  let result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.rule_violations.length, 1);
  assert.strictEqual(result.rule_violations[0].legacy, true);
  assert.strictEqual(result.legacy_violation_count, 1);
  assert.deepStrictEqual(
    {
      legacy: result.violation_baseline.legacy,
      introduced: result.violation_baseline.introduced,
      resolved: result.violation_baseline.resolved,
    },
    { legacy: 1, introduced: 0, resolved: 0 },
  );

  write(root, 'src/new.ts', 'BAD\n');
  result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.violation_baseline.introduced, 1);
  assert.ok(result.errors.some((error) =>
    error.includes('debt.no-bad') && error.includes('src/new.ts')),
  result.errors.join('\n'));

  fs.rmSync(path.join(root, 'src/new.ts'));
  write(root, 'src/legacy.ts', '\n\nBAD\nBAD\n');
  result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.violation_baseline.legacy, 1,
    'line movement must not relabel existing debt');
  assert.strictEqual(result.violation_baseline.introduced, 1,
    'a duplicate occurrence in the same file is new debt');

  write(root, 'src/legacy.ts', 'SAFE\n');
  result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.violation_baseline.resolved, 1);
});

test('no-new enforcement follows Git renames without laundering additional debt', () => {
  const { root, base } = noNewRepo();
  fs.renameSync(path.join(root, 'src/legacy.ts'), path.join(root, 'src/renamed.ts'));
  git(root, 'add -A');

  const result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.violation_baseline.legacy, 1);
  assert.strictEqual(result.rule_violations[0].file, 'src/renamed.ts');
  assert.strictEqual(result.rule_violations[0].legacy, true);
});

test('a newly adopted no-new rule derives legacy debt with the candidate rule', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, 'src/legacy.ts', 'BAD\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');
  const base = git(root, 'rev-parse HEAD').trim();

  write(root, '.agentlintel/rules.yaml', NO_NEW_RULES);
  const result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.violation_baseline.legacy, 1);
  assert.strictEqual(result.violation_baseline.introduced, 0);
  assert.strictEqual(result.ratchet.ok, true, 'adding a rule is not a weakening');
});

test('tree-wide required-evidence debt is stable when the first scoped file changes', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: architecture.proof',
    '    severity: error',
    '    engine: regex',
    '    enforcement: no-new',
    '    applies_to: ["src/**/*.ts"]',
    '    must_match: true',
    '    required: ["ARCHITECTURE-PROOF"]',
    '    message: "Architecture proof is required"',
  ].join('\n'));
  write(root, 'src/z.ts', 'SAFE\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');
  const base = git(root, 'rev-parse HEAD').trim();

  write(root, 'src/a.ts', 'SAFE\n');
  const result = verify(root, { skipFixtures: true, base });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.strictEqual(result.violation_baseline.legacy, 1);
  assert.strictEqual(result.violation_baseline.introduced, 0);
});

test('no-new baselines every supported built-in file engine', () => {
  const cases = [
    {
      engine: 'error-codes',
      config: [
        '    applies_to: ["src/**/*.ts"]',
        '    categories: [VAL]',
      ],
      files: { 'src/errors.ts': "export const code = 'billing-VAL-1';\n" },
    },
    {
      engine: 'layers',
      config: [
        '    layers:',
        '      - { name: presentation, path: ["src/presentation/**"] }',
        '      - { name: business, path: ["src/business/**"] }',
        '      - { name: data, path: ["src/data/**"] }',
        '    allowed:',
        '      presentation: [business]',
        '      business: [data]',
        '      data: []',
      ],
      files: {
        'src/presentation/page.ts': "import { repo } from '../data/repo';\n",
        'src/data/repo.ts': 'export const repo = {};\n',
      },
    },
  ];

  for (const scenario of cases) {
    const root = tmpDir();
    git(root, 'init -q');
    git(root, 'config user.email t@t.t');
    git(root, 'config user.name t');
    write(root, '.agentlintel/rules.yaml', [
      'version: 2',
      'rules:',
      `  - id: debt.${scenario.engine}`,
      '    severity: error',
      `    engine: ${scenario.engine}`,
      '    enforcement: no-new',
      ...scenario.config,
      '    message: "legacy architecture debt"',
    ].join('\n'));
    for (const [file, content] of Object.entries(scenario.files))
      write(root, file, content);
    git(root, 'add -A');
    git(root, 'commit -q -m baseline');
    const base = git(root, 'rev-parse HEAD').trim();

    const result = verify(root, { skipFixtures: true, base });
    assert.strictEqual(result.ok, true,
      `${scenario.engine}: ${result.errors.join('\n')}`);
    assert.strictEqual(result.violation_baseline.legacy, 1, scenario.engine);
    assert.strictEqual(result.violation_baseline.introduced, 0, scenario.engine);
  }
});

test('no-new enforcement fails closed when its comparison base is absent or unsupported', () => {
  const { root } = noNewRepo();
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.warnings.some((warning) =>
    warning.includes('VIOLATION-BASE') && warning.includes('--base')),
  result.warnings.join('\n'));
  assert.strictEqual(result.rule_violations[0].legacy, undefined);
  assert.strictEqual(result.ok, false, 'unclassified debt remains an active finding');

  write(root, '.agentlintel/rules.yaml', NO_NEW_RULES.replace(
    'engine: regex',
    'engine: external\n    evidence: ["checker.js"]\n    run: "node checker.js"',
  ));
  result = verify(root, { skipFixtures: true, run: false });
  assert.ok(result.rule_config.some((error) =>
    error.includes('no-new does not support the external engine')),
  result.rule_config.join('\n'));
});

test('switching an existing rule to no-new is a ratcheted weakening', () => {
  const current = { version: 2, rules: [{
    id: 'debt.no-bad',
    severity: 'error',
    engine: 'regex',
    applies_to: ['src/**/*.ts'],
    forbidden: ['BAD'],
    message: 'BAD is forbidden',
  }] };
  const findings = detectRuleWeakening(current, {
    version: 2,
    rules: [{ ...current.rules[0], enforcement: 'no-new' }],
  });
  assert.ok(findings.includes(
    "rule 'debt.no-bad' changed enforcement from all violations to no-new",
  ));
});

test('an unresolvable guard base is a WARNING, never a silent pass', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []');
  write(root, '.agentlintel/guard.json', JSON.stringify({ version: 2, zones: [{ id: 'all', allow: ['**/*'] }], forbidden: [] }));
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  const result = verify(root, { skipFixtures: true, base: 'origin/nonexistent-branch-xyz' });
  assert.ok(
    result.warnings.some((w) => w.includes('GUARD-BASE')),
    `expected GUARD-BASE warning, got: ${JSON.stringify(result.warnings)}`,
  );
  assert.strictEqual(verify(root, { skipFixtures: true, base: 'origin/nonexistent-branch-xyz', strict: true }).ok, false, 'fails under --strict');
});

test('a comparison base must resolve to a commit, not another Git object type', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  const result = verify(root, { skipFixtures: true, base: 'HEAD^{tree}' });
  assert.ok(result.errors.some((error) =>
    error.includes('BASE') && error.includes('must resolve to a commit')),
  result.errors.join('\n'));
  assert.strictEqual(result.ok, false);
});

test('Git-backed verification refuses a nested directory root', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, 'app/.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, 'app/.agentlintel/facts.yaml', [
    'version: 2',
    'facts:',
    '  - id: command-proof',
    '    claim: command runs only after inventory validation',
    '    check: { type: command, run: "node --version" }',
  ].join('\n'));
  write(root, 'app/src/a.ts', 'export {};\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');
  const baseline = git(root, 'rev-parse HEAD').trim();

  write(root, 'app/.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  let result = verify(path.join(root, 'app'), { skipFixtures: true, base: baseline });
  assert.ok(result.errors.some((error) =>
    error.includes('verification root must be the Git top-level')),
  result.errors.join('\n'));
  assert.strictEqual(result.facts[0].skipped, true,
    'invalid inventory must disable executable facts');

  git(root, 'add -A');
  git(root, 'commit -q -m weaken');
  result = verify(path.join(root, 'app'), { skipFixtures: true, base: baseline });
  assert.ok(result.errors.some((error) =>
    error.includes('verification root must be the Git top-level')),
  result.errors.join('\n'));
});

