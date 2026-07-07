// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verify, verifyFacts } = require('../src/lib/verify');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
  fs.writeFileSync(path.join(dir, 'present.txt'), 'orm: prisma\n');
  return dir;
}

test('path_exists and file_contains facts verify against the tree', () => {
  const root = tmpProject();
  const results = verifyFacts(root, {
    facts: [
      { id: 'ok-path', claim: 'file exists', check: { type: 'path_exists', path: 'present.txt' } },
      { id: 'stale-path', claim: 'file exists', check: { type: 'path_exists', path: 'missing.txt' } },
      { id: 'ok-contains', claim: 'uses prisma', check: { type: 'file_contains', path: 'present.txt', pattern: 'prisma' } },
      { id: 'stale-contains', claim: 'uses typeorm', check: { type: 'file_contains', path: 'present.txt', pattern: 'typeorm' } },
    ],
  });
  assert.deepStrictEqual(results.map((r) => r.ok), [true, false, true, false]);
});

test('command facts run and compare exit codes; --no-run skips them', () => {
  const root = tmpProject();
  const facts = {
    facts: [{ id: 'cmd', claim: 'node runs', check: { type: 'command', run: 'node -e "process.exit(0)"' } }],
  };
  assert.strictEqual(verifyFacts(root, facts, { run: true })[0].ok, true);
  const skipped = verifyFacts(root, facts, { run: false })[0];
  assert.strictEqual(skipped.ok, true);
  assert.strictEqual(skipped.skipped, true);
  assert.match(skipped.detail, /skipped/);
});

test('--no-run command facts warn and fail strict mode instead of silently passing', () => {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, '.agentlintel'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agentlintel', 'facts.yaml'), [
    'version: 2',
    'facts:',
    '  - id: cmd',
    '    claim: "command fact runs"',
    '    check: { type: command, run: "node -e \\"process.exit(0)\\"" }',
  ].join('\n'));

  const result = verify(root, { run: false, skipFixtures: true });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('NO-RUN FACT [cmd]')));
  assert.strictEqual(verify(root, { run: false, skipFixtures: true, strict: true }).ok, false);
});
