// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'agentlintel.js');

// Temp repositories have no origin; do not leak the pull request base into them.
delete process.env.GITHUB_BASE_REF;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-cli-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function run(args, cwd = tmpDir()) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
}

test('CLI rejects unknown flags instead of silently ignoring them', () => {
  const r = run(['verify', '--skip-fixture']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Unknown option '--skip-fixture'/);
});

test('CLI rejects missing option values', () => {
  for (const flag of ['--dir', '--base', '--pattern', '--path', '--mode']) {
    const r = run(['verify', flag]);
    assert.strictEqual(r.status, 2, flag);
    assert.match(r.stderr, new RegExp(`${flag} requires a value`));
  }
});

test('CLI rejects unknown verify modes', () => {
  const r = run(['verify', '--mode', 'advice']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Unknown --mode 'advice'/);
});

test('CLI rejects known options on commands that do not use them', () => {
  for (const args of [
    ['verify', '--force'],
    ['init', '--strict'],
    ['explain', '--base', 'HEAD'],
    ['report', '--pattern', 'mvvm'],
  ]) {
    const result = run(args);
    assert.strictEqual(result.status, 2, args.join(' '));
    assert.match(result.stderr, /does not apply/);
  }
});

test('verify --mode warn downgrades gate findings without failing', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no.boom',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, 'src/a.ts', 'boom\n');
  const r = run(['verify', '--dir', root, '--mode', 'warn', '--strict', '--skip-fixtures']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /warn mode/);
  assert.match(r.stdout, /warn ADVISORY RULE \[no\.boom\]/);
  assert.match(r.stdout, /GATE PASSED/);
});

test('rule adr provenance is printed with verify violations', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no.boom',
    '    severity: error',
    '    engine: regex',
    '    adr: ADR-123',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, 'src/a.ts', 'boom\n');
  const r = run(['verify', '--dir', root, '--skip-fixtures']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /RULE \[no\.boom\] \[ADR-123\] src\/a\.ts:1 no boom/);
});

test('explain reports matching rules, guard zones, exemplars, and decisions', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no.boom',
    '    severity: error',
    '    engine: regex',
    '    adr: ADR-123',
    '    applies_to: ["src/**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'app', allow: ['src/**'] }],
    forbidden: ['secrets/**'],
  }));
  write(root, '.agentlintel/exemplars.yaml', [
    'version: 2',
    'exemplars:',
    '  - id: sample',
    '    shape: service',
    '    path: src',
    '    demonstrates: sample code',
  ].join('\n'));
  write(root, '.agentlintel/decisions/ADR-123-no-boom.md', '# ADR-123: No Boom\n');
  const r = run(['explain', '--dir', root, '--path', 'src/a.ts', '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.path, 'src/a.ts');
  assert.strictEqual(parsed.rules[0].id, 'no.boom');
  assert.strictEqual(parsed.guard.zones[0].id, 'app');
  assert.strictEqual(parsed.exemplars[0].id, 'sample');
  assert.strictEqual(parsed.decisions[0].id, 'ADR-123');
});

test('explain reports malformed governance instead of crashing', () => {
  const root = tmpDir();
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: 'not-an-array',
    forbidden: 'also-not-an-array',
  }));
  const result = run(['explain', '--dir', root, '--path', 'src/a.js']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /KERNEL-SCHEMA/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test('quiet strict failures include a warning that caused the block', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: ghost.rule',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["missing/**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: never fires',
  ].join('\n'));
  const r = run(['verify', '--dir', root, '--strict', '--quiet', '--skip-fixtures']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /WARN FIXTURES-SKIPPED/);
  assert.match(r.stdout, /GATE FAILED/);
});

test('dormant must_match: false rules pass the local gate but remain visible', () => {
  const root = tmpDir();
  spawnSync('git', ['init', '-q'], { cwd: root });
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: ghost.rule',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["missing/**/*.ts"]',
    '    must_match: false',
    '    forbidden: ["boom"]',
    '    message: never fires',
  ].join('\n'));
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'governance', allow: ['.agentlintel/**'] }],
    forbidden: [],
  }));
  write(root, '.agentlintel/facts.yaml', 'version: 2\nfacts:\n  - { id: rules, claim: rules, check: { type: path_exists, path: .agentlintel/rules.yaml } }\n');
  write(root, '.agentlintel/exemplars.yaml', 'version: 2\nexemplars:\n  - { id: rules, shape: config, path: .agentlintel/rules.yaml, demonstrates: executable rules }\n');
  const r = run(['verify', '--dir', root, '--skip-fixtures']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /1 dormant \(must_match: false\)/);
});

test('report --json emits parseable JSON and preserves gate exit code', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  const r = run(['report', '--dir', root, '--json', '--skip-fixtures']);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
});
