// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'agentlintel.js');

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
  for (const flag of ['--dir', '--base', '--pattern']) {
    const r = run(['verify', flag]);
    assert.strictEqual(r.status, 2, flag);
    assert.match(r.stderr, new RegExp(`${flag} requires a value`));
  }
});

test('quiet strict failures include the warning that caused the block', () => {
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
  assert.match(r.stdout, /WARN RULE-SCOPE/);
  assert.match(r.stdout, /GATE FAILED/);
});

test('report --json emits parseable JSON and preserves gate exit code', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  const r = run(['report', '--dir', root, '--json', '--skip-fixtures']);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
});
