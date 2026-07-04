// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { verify, verifyFacts, detectRuleWeakening } = require('../src/lib/verify');
const REPO = path.join(__dirname, '..', '..', '..');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function git(root, command) {
  return execSync(`git ${command}`, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

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

const RATCHET_BASE_RULES = [
  'version: 2',
  'rules:',
  '  - id: slice.no-deep-imports',
  '    severity: error',
  '    engine: regex',
  '    applies_to: ["src/**/*.ts"]',
  '    must_match: true',
  '    forbidden: ["from slices/.+/domain"]',
  '    message: "Deep imports forbidden."',
].join('\n');

test('weakening rules.yaml fails unless the same diff carries an ADR', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/rules.yaml', ['version: 2', 'rules: []'].join('\n'));
  const weakened = verify(root, { skipFixtures: true });
  assert.strictEqual(weakened.ok, false);
  assert.ok(weakened.errors.some((e) => e.includes('RATCHET') && e.includes('slice.no-deep-imports')), weakened.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-999-rule-retirement.md', '# ADR-999: Retire Deep Import Rule\n\nAccepted.\n');
  const governed = verify(root, { skipFixtures: true });
  assert.ok(!governed.errors.some((e) => e.includes('RATCHET')), governed.errors.join('\n'));
});

test('detectRuleWeakening catches common silent-weaken channels', () => {
  const findings = detectRuleWeakening(
    {
      rules: [
        {
          id: 'arch.layers',
          severity: 'error',
          engine: 'layers',
          applies_to: ['src/**', 'tests/**'],
          must_match: true,
          layers: [{ name: 'ui', path: ['src/ui/**'] }, { name: 'data', path: ['src/data/**'] }],
          allowed: { ui: [] },
        },
        { id: 'secrets.no-logging', severity: 'error', engine: 'regex', forbidden: ['token', 'password'] },
      ],
    },
    {
      rules: [
        {
          id: 'arch.layers',
          severity: 'warn',
          engine: 'layers',
          applies_to: ['src/**'],
          excludes: ['src/legacy/**'],
          layers: [{ name: 'ui', path: ['src/ui/**'] }],
          allowed: { ui: ['data'] },
        },
        { id: 'secrets.no-logging', severity: 'error', engine: 'regex', forbidden: ['token'] },
      ],
    },
  );
  assert.ok(findings.some((f) => f.includes('severity was downgraded')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('no longer requires')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('narrowed applies_to')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('added exclude')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes("removed layer 'data'")), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('expanded allowed dependency ui -> data')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('removed forbidden pattern "password"')), findings.join('\n'));
});

test('rules with explicit scopes scan files outside the default text extensions', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: csproj.no-netfx',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.csproj"]',
    '    must_match: true',
    '    forbidden: ["net472"]',
    '    message: "no full framework"',
  ].join('\n'));
  write(root, 'App.csproj', '<TargetFramework>net472</TargetFramework>');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('csproj.no-netfx') && e.includes('App.csproj')), result.errors.join('\n'));
  assert.ok(!result.errors.some((e) => e.includes('RULE-SCOPE')), 'scope matched, no empty-match error');
});

test('kernel schema catches misspelled top-level collections', () => {
  const root = tmpDir();
  write(root, '.agentlintel/facts.yaml', 'version: 2\nfactz: []\n');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('KERNEL-SCHEMA') && e.includes('facts must be an array')),
    result.errors.join('\n'),
  );
});

test('dependency and vendor directories are skipped before rule scanning', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no-secret-logs',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.py"]',
    '    forbidden: ["logger\\\\.info\\\\(password\\\\)"]',
    '    message: "no secret logs"',
  ].join('\n'));
  for (const rel of [
    '.venv/lib/site-packages/pkg/leak.py',
    'venv/lib/site-packages/pkg/leak.py',
    'target/generated/pkg/leak.py',
    'vendor/pkg/leak.py',
  ]) {
    write(root, rel, 'logger.info(password)\n');
  }
  const result = verify(root, { skipFixtures: true });
  assert.deepStrictEqual(result.rule_violations, []);
  assert.ok(!result.errors.some((e) => e.includes('no-secret-logs')), result.errors.join('\n'));
});

test('default-scope rules scan native language extensions', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: native.no-forbidden',
    '    severity: error',
    '    engine: regex',
    '    forbidden: ["NATIVE_FORBIDDEN"]',
    '    message: "native extension scanned"',
  ].join('\n'));
  write(root, 'src/main.cpp', 'NATIVE_FORBIDDEN\n');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('native.no-forbidden') && e.includes('src/main.cpp')), result.errors.join('\n'));
});

test('starter secrets rule covers Rust, C++, Scala, and Elixir files', () => {
  const root = tmpDir();
  const rules = fs.readFileSync(path.join(REPO, 'tools/agentlintel-cli/templates/rules.template.yaml'), 'utf8');
  write(root, '.agentlintel/rules.yaml', rules);
  for (const rel of ['src/main.rs', 'src/main.cpp', 'src/Main.scala', 'lib/main.ex']) {
    write(root, rel, 'logger.info(password)\n');
  }
  const result = verify(root, { skipFixtures: true });
  for (const rel of ['src/main.rs', 'src/main.cpp', 'src/Main.scala', 'lib/main.ex']) {
    assert.ok(
      result.rule_violations.some((v) => v.rule === 'secrets.no-logging' && v.file === rel),
      `${rel} was not flagged:\n${result.errors.join('\n')}`,
    );
  }
});

test('line_count_max uses wc -l semantics (trailing newline is not a new line)', () => {
  const root = tmpDir();
  write(root, 'exact.md', 'a\nb\nc\n');
  const results = verifyFacts(root, {
    facts: [{ id: 'x', claim: 'exactly 3', check: { type: 'line_count_max', path: 'exact.md', max: 3 } }],
  });
  assert.strictEqual(results[0].ok, true, results[0].detail);
});
