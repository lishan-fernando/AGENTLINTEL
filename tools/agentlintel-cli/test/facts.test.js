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

test('fact paths cannot escape the repository', () => {
  const root = tmpProject();
  const results = verifyFacts(root, {
    facts: [
      { id: 'escape-path', claim: 'outside file', check: { type: 'path_exists', path: '../outside.txt' } },
      { id: 'escape-glob', claim: 'outside glob', check: { type: 'glob_count', pattern: '../**/*', min: 1 } },
    ],
  });
  assert.deepStrictEqual(results.map((result) => result.ok), [false, false]);
  assert.ok(results.every((result) => result.detail.includes('inside the repository')));
});

test('fact evidence must use the repository inventory spelling', () => {
  const root = tmpProject();
  const results = verifyFacts(root, {
    facts: [
      { id: 'case-read', claim: 'exact file', check: { type: 'file_contains', path: 'PRESENT.TXT', pattern: 'prisma' } },
      { id: 'case-absent', claim: 'alias absent', check: { type: 'file_absent', path: 'PRESENT.TXT' } },
    ],
  }, { treeFiles: ['present.txt'] });
  assert.deepStrictEqual(results.map((result) => result.ok), [false, false]);
  assert.ok(results.every((result) => /inventory|different spelling/.test(result.detail)),
    results.map((result) => result.detail).join('\n'));
});

test('NTFS alternate data streams cannot satisfy fact evidence', {
  skip: process.platform !== 'win32',
}, () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'present.txt:proof'), 'MAGIC\n');
  const result = verifyFacts(root, {
    facts: [{
      id: 'ads-proof',
      claim: 'portable proof',
      check: { type: 'file_contains', path: 'present.txt:proof', pattern: 'MAGIC' },
    }],
  }, { treeFiles: ['present.txt'] })[0];
  assert.strictEqual(result.ok, false);
  assert.match(result.detail, /canonical/);
});

test('fact, kernel, and source scans reject symlinked evidence', (t) => {
  const root = tmpProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-outside-'));
  fs.writeFileSync(path.join(outside, 'payload.txt'), 'TOKEN_FROM_OUTSIDE\n');
  try {
    fs.symlinkSync(path.join(outside, 'payload.txt'), path.join(root, 'leak.txt'), 'file');
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.code || error.message}`);
    return;
  }

  const fact = verifyFacts(root, {
    facts: [{ id: 'leak', claim: 'outside content', check: { type: 'file_contains', path: 'leak.txt', pattern: 'TOKEN' } }],
  })[0];
  assert.strictEqual(fact.ok, false);
  assert.match(fact.detail, /regular file/);
  fs.mkdirSync(path.join(root, 'links'));
  fs.symlinkSync(path.join(outside, 'payload.txt'), path.join(root, 'links', 'proof.txt'), 'file');
  const globFact = verifyFacts(root, {
    facts: [{ id: 'glob', claim: 'proof exists', check: { type: 'glob_count', pattern: 'links/*.txt', min: 1 } }],
  })[0];
  assert.strictEqual(globFact.ok, false);
  assert.match(globFact.detail, /non-regular evidence/);

  fs.mkdirSync(path.join(root, '.agentlintel'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'rules.yaml'), 'version: 2\nrules: []\n');
  fs.symlinkSync(path.join(outside, 'rules.yaml'), path.join(root, '.agentlintel', 'rules.yaml'), 'file');
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('rules.yaml') && error.includes('regular file')), result.errors.join('\n'));

  fs.unlinkSync(path.join(root, '.agentlintel', 'rules.yaml'));
  fs.writeFileSync(path.join(root, '.agentlintel', 'rules.yaml'), [
    'version: 2',
    'rules:',
    '  - { id: source.scan, severity: error, engine: regex, forbidden: [FORBIDDEN], message: "Symlinked source must fail." }',
  ].join('\n'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'payload.txt'), 'FORBIDDEN\n');
  fs.symlinkSync('../payload.txt', path.join(root, 'src', 'linked.js'), 'file');
  fs.mkdirSync(path.join(root, 'payload-dir'), { recursive: true });
  fs.writeFileSync(path.join(root, 'payload-dir', 'child.js'), 'FORBIDDEN\n');
  fs.symlinkSync(path.join(root, 'payload-dir'), path.join(root, 'src', 'domain'), 'junction');
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('agentlintel.scan-failure') && error.includes('linked.js')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('agentlintel.scan-failure') && error.includes('src/domain')), result.errors.join('\n'));
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
