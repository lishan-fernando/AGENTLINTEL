// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { verify } = require('../src/lib/verify');
const {
  tmpDir, write, git, RATCHET_BASE_RULES,
} = require('./governance-helpers');

test('weakening rules.yaml fails unless the same diff carries exact ADR authority', () => {
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

  write(root, '.agentlintel/decisions/ADR-998-unrelated.md', '# ADR-998: Unrelated\n\nAccepted: 2026-07-09\n\nDecision:\n\nDocument an unrelated choice.\n');
  const unrelated = verify(root, { skipFixtures: true });
  assert.ok(unrelated.errors.some((e) => e.includes('RATCHET') && e.includes('slice.no-deep-imports')),
    unrelated.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-999-rule-retirement.md', '# ADR-999: Retire Deep Import Rule\n\nAccepted: 2026-07-09\n\nDecision:\n\nRetire the obsolete rule.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/rules.yaml","finding":"rule \'slice.no-deep-imports\' was deleted"}\n');
  const governed = verify(root, { skipFixtures: true });
  assert.ok(!governed.errors.some((e) => e.includes('RATCHET')), governed.errors.join('\n'));
});

test('registered exemplar implementation bytes require exact new-ADR authority', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/exemplars.yaml', 'version: 2\nexemplars:\n  - { id: command, shape: cli, path: src/a.js, demonstrates: "command shape" }\n');
  write(root, 'src/a.js', 'module.exports = { safe: true };\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, 'src/a.js', 'module.exports = { safe: false };\n');
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) =>
    error.includes('RATCHET [exemplars.yaml]') && error.includes("implementation changed at 'src/a.js'")),
  result.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-202-change-exemplar-code.md', '# ADR-202: Change exemplar code\n\nAccepted: 2026-07-09\n\nDecision:\n\nChange the canonical implementation.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/exemplars.yaml","finding":"exemplar \'command\' implementation changed at \'src/a.js\'"}\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('RATCHET [exemplars.yaml]')),
    result.errors.join('\n'));
});

test('external checker evidence bytes are protected and exact-authorized', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: external.architecture',
    '    severity: error',
    '    engine: external',
    '    evidence: [checker.js]',
    '    run: "node checker.js"',
    '    message: architecture',
  ].join('\n'));
  write(root, 'checker.js', 'process.exit(0);\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, 'checker.js', 'process.exit(1);\n');
  let result = verify(root, { skipFixtures: true, run: false });
  assert.ok(result.errors.some((error) =>
    error.includes('RATCHET [rules.yaml]') && error.includes("external evidence changed at 'checker.js'")),
  result.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-203-change-checker.md', '# ADR-203: Change checker\n\nAccepted: 2026-07-09\n\nDecision:\n\nChange the native checker.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/rules.yaml","finding":"rule \'external.architecture\' external evidence changed at \'checker.js\'"}\n');
  result = verify(root, { skipFixtures: true, run: false });
  assert.ok(!result.errors.some((error) => error.includes('RATCHET [rules.yaml]')),
    result.errors.join('\n'));
});

test('deleting a baseline required-evidence trigger cannot deactivate the rule', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: state.requires-contract',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.ts"]',
    '    required: ["StateContract"]',
    '    when: ["StateFeature"]',
    '    message: state feature needs a contract',
  ].join('\n'));
  write(root, 'src/state.ts', 'export const StateFeature = StateContract;\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, 'src/state.ts', 'export const renamed = StateContract;\n');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) =>
    error.includes('state.requires-contract') && error.includes('trigger matched the baseline but disappeared')),
  result.errors.join('\n'));
});

test('weakening or relabeling a fact requires a new ADR', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/facts.yaml', [
    'version: 2',
    'facts:',
    '  - id: entry-budget',
    '    claim: "entry stays small"',
    '    check: { type: byte_count_max, path: AGENTS.md, max: 10 }',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, 'AGENTS.md', 'small\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/facts.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/facts.yaml'), 'utf8',
  ).replace('entry stays small', 'another claim'));
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('RATCHET [facts.yaml]') && error.includes('asserted claim')),
    result.errors.join('\n'));

  write(root, '.agentlintel/facts.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/facts.yaml'), 'utf8',
  ).replace('another claim', 'entry stays small').replace('max: 10', 'max: 100'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('RATCHET [facts.yaml]') && error.includes('raised max')),
    result.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-200-adjust-budget.md',
    '# ADR-200: Adjust budget\n\nAccepted: 2026-07-09\n\nDecision:\n\nRaise the measured entry budget.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/facts.yaml","finding":"fact \'entry-budget\' raised max from 10 to 100"}\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('RATCHET [facts.yaml]')),
    result.errors.join('\n'));
});

test('removing or mutating canonical exemplar evidence requires a new ADR', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/exemplars.yaml', [
    'version: 2',
    'exemplars:',
    '  - { id: command, shape: cli, path: src/a.js, demonstrates: "command shape" }',
  ].join('\n'));
  write(root, 'src/a.js', 'module.exports = {};\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/exemplars.yaml', [
    'version: 2',
    'exemplars:',
    '  - { id: command, shape: cli, path: src/a.js, demonstrates: "different claim" }',
  ].join('\n'));
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('RATCHET [exemplars.yaml]')),
    result.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-201-change-exemplar.md',
    '# ADR-201: Change exemplar\n\nAccepted: 2026-07-09\n\nDecision:\n\nChange the canonical CLI evidence.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/exemplars.yaml","finding":"exemplar \'command\' changed canonical evidence"}\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('RATCHET [exemplars.yaml]')),
    result.errors.join('\n'));
});

test('existing ADRs are immutable and cannot authorize a weakening', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, '.agentlintel/decisions/ADR-100-original.md', '# ADR-100: Original\n\nAccepted.\n');
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/decisions/ADR-100-original.md', '# ADR-100: Rewritten\n\nAccepted.\n');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('DECISION [append-only]') && e.includes('modified')), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));

  fs.unlinkSync(path.join(root, '.agentlintel/decisions/ADR-100-original.md'));
  const deleted = verify(root, { skipFixtures: true });
  assert.ok(deleted.errors.some((e) => e.includes('DECISION [append-only]') && e.includes('deleted')), deleted.errors.join('\n'));
});

test('a heading-and-date ADR shell cannot authorize a weakening', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/decisions/ADR-999-empty.md',
    '# ADR-999: Empty shell\n\nAccepted: 2026-07-09\n');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('DECISION [append-only]') && e.includes("Decision:")), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));
});

test('ADR authorization requires a unique number and an exact accepted status', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, '.agentlintel/decisions/ADR-100-original.md', '# ADR-100: Original\n\nAccepted: 2026-01-01\n');
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/decisions/ADR-100-copy.md', '# ADR-100: Copy\n\nAccepted: 2026-07-09\n');
  let result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('ADR-100') && error.includes('already in use')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));

  fs.unlinkSync(path.join(root, '.agentlintel/decisions/ADR-100-copy.md'));
  write(root, '.agentlintel/decisions/ADR-101-rejected.md', '# ADR-101: Rejected\n\nStatus: Rejected - not Accepted.\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Accepted: YYYY-MM-DD')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));

  fs.unlinkSync(path.join(root, '.agentlintel/decisions/ADR-101-rejected.md'));
  write(root, '.agentlintel/decisions/ADR-102-invalid-date.md',
    '# ADR-102: Invalid date\n\nAccepted: 2026-02-30\n\nDecision:\n\nChange the rule.\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('real calendar date')), result.errors.join('\n'));

  fs.unlinkSync(path.join(root, '.agentlintel/decisions/ADR-102-invalid-date.md'));
  write(root, '.agentlintel/decisions/ADR-103-future.md',
    '# ADR-103: Future\n\nAccepted: 9999-01-01\n\nDecision:\n\nChange the rule.\n');
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('cannot be in the future')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));
});

test('a symlinked ADR cannot authorize a weakening', (t) => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', RATCHET_BASE_RULES);
  write(root, 'src/a.ts', 'export {}');
  write(root, 'docs/decision.md', '# ADR-999: Mutable decision\n\nAccepted: 2026-07-09\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  const decision = path.join(root, '.agentlintel', 'decisions', 'ADR-999-mutable.md');
  fs.mkdirSync(path.dirname(decision), { recursive: true });
  try {
    fs.symlinkSync(path.join(root, 'docs', 'decision.md'), decision, 'file');
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.code || error.message}`);
    return;
  }
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('new decision must be a regular')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('RATCHET [rules.yaml]')), result.errors.join('\n'));
});

test('committed renames retain source paths for ADR immutability and guard checks', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'all', allow: ['**/*'] }],
    forbidden: ['secrets/**'],
  }));
  write(root, '.agentlintel/decisions/ADR-100-original.md', '# ADR-100: Original\n\nAccepted: 2026-01-01\n');
  write(root, 'secrets/key.txt', 'not-a-real-secret');
  write(root, 'docs/.keep', '');
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  const base = git(root, 'rev-parse HEAD').trim();

  git(root, 'mv .agentlintel/decisions/ADR-100-original.md docs/decision.md');
  git(root, 'mv secrets/key.txt docs/key.txt');
  git(root, 'commit -q -am rename');
  const result = verify(root, { skipFixtures: true, base });
  assert.ok(result.errors.some((error) => error.includes('ADR-100-original.md') && error.includes('deleted')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('GUARD [guard.forbidden] secrets/key.txt')), result.errors.join('\n'));
});

test('guard expansion needs a new ADR and an empty guard fails closed', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'src', allow: ['src/**'] }],
    forbidden: ['secrets/**'],
  }));
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'src', allow: ['src/app/**'] }],
    forbidden: ['secrets/**', 'generated/**'],
  }));
  const tightened = verify(root, { skipFixtures: true });
  assert.ok(!tightened.errors.some((e) => e.includes('RATCHET [guard.json]')), tightened.errors.join('\n'));

  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'all', allow: ['**/*'] }],
    forbidden: [],
  }));
  const weakened = verify(root, { skipFixtures: true });
  assert.ok(weakened.errors.some((e) => e.includes('RATCHET [guard.json]')), weakened.errors.join('\n'));

  write(root, '.agentlintel/decisions/ADR-999-expand-writes.md', '# ADR-999: Expand writes\n\nAccepted: 2026-07-09\n\nDecision:\n\nExpand the reviewed write boundary.\n\nAuthorizes-Weakening: {"artifact":".agentlintel/guard.json","finding":"guard added or changed allow glob \'**/*\' outside prior coverage"}\nAuthorizes-Weakening: {"artifact":".agentlintel/guard.json","finding":"guard removed or narrowed forbidden glob \'secrets/**\'"}\n');
  const governed = verify(root, { skipFixtures: true });
  assert.ok(!governed.errors.some((e) => e.includes('RATCHET [guard.json]')), governed.errors.join('\n'));

  write(root, '.agentlintel/guard.json', JSON.stringify({ version: 2, zones: [], forbidden: [] }));
  const empty = verify(root, { skipFixtures: true });
  assert.ok(empty.errors.some((e) => e.includes('at least one write-zone allow glob')), empty.errors.join('\n'));

  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'invalid', allow: [{}] }],
    forbidden: [],
  }));
  const malformed = verify(root, { skipFixtures: true });
  assert.ok(malformed.errors.some((error) => error.includes('allow must be a non-empty string array')), malformed.errors.join('\n'));
});

