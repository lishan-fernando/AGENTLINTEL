// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const {
  verify,
  verifyFacts,
  detectRuleWeakening,
  preparedRuleSet,
  checkGuard,
  checkAdapters,
} = require('../src/lib/verify');
const REPO = path.join(__dirname, '..', '..', '..');

// Hermetic: on pull_request events the engine's resolveBase falls back to
// origin/$GITHUB_BASE_REF (a feature for adopter CI), but these temp repos
// have no origin - the leaked ref degrades the ratchet to a warning.
delete process.env.GITHUB_BASE_REF;

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
        { id: 'secrets.no-logging', severity: 'error', engine: 'regex', forbidden: ['token', 'password'], required: ['redact'], when: ['logger'], match: 'file' },
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
        { id: 'secrets.no-logging', severity: 'error', engine: 'regex', forbidden: ['token'], required: [], when: [], match: 'line' },
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
  assert.ok(findings.some((f) => f.includes('removed required pattern "redact"')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('required-evidence trigger "logger"')), findings.join('\n'));
  assert.ok(findings.some((f) => f.includes('changed regex match mode')), findings.join('\n'));
});

test('detectRuleWeakening covers effective-value bypass knobs', () => {
  const findings = detectRuleWeakening(
    {
      rules: [
        { id: 'regex.rule', engine: 'regex', flags: 'i', must_match: undefined, forbidden: ['x'], aliases: { '@/': 'src/' } },
        { id: 'codes.rule', engine: 'error-codes', categories: ['VAL'] },
        { id: 'exempt.rule', engine: 'exemptions', required_fields: ['Reason', 'Approver', 'Expires', 'Owner', 'Decision'], within_lines: 5 },
        { id: 'external.rule', engine: 'external', adapter: 'jsonl', scope: 'tree', run: 'npm test', ok_exits: [0] },
      ],
    },
    {
      rules: [
        { id: 'regex.rule', engine: 'regex', flags: 'y', must_match: false, forbidden: ['x'], aliases: { '@/': 'src/', '@/domain/': 'vendor/' } },
        { id: 'codes.rule', engine: 'error-codes', categories: ['VAL', 'OTHER'] },
        { id: 'exempt.rule', engine: 'exemptions', required_fields: ['Reason', 'Expires', 'Decision'], within_lines: 10 },
        { id: 'external.rule', engine: 'external', adapter: 'command-status', scope: 'pr', run: 'npm test', ok_exits: [0, 1] },
      ],
    },
  );
  for (const expected of [
    'made dormant',
    "removed regex flag 'i'",
    "sticky regex flag 'y'",
    'shadowing alias',
    'accepted error category',
    'required exemption field',
    'expanded exemption window',
    'external adapter',
    'external scope',
    'accepted external exit',
  ])
    assert.ok(findings.some((f) => f.includes(expected)), `${expected}:\n${findings.join('\n')}`);
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

test('kernel schema rejects duplicate ids and empty guards', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - { id: duplicate.rule, severity: error, engine: regex, forbidden: [x] }',
    '  - { id: duplicate.rule, severity: error, engine: regex, forbidden: [y] }',
  ].join('\n'));
  write(root, '.agentlintel/guard.json', JSON.stringify({ version: 2, zones: [], forbidden: [] }));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes("duplicate id 'duplicate.rule'")), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('duplicate rule id')), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('at least one write-zone allow glob')), result.errors.join('\n'));
});

test('repository scopes reject absolute paths and unsupported glob syntax', () => {
  for (const scope of ['C:/secret/**', 'src/{a,b}/**', 'src/[ab]/**']) {
    const prepared = preparedRuleSet({
      version: 2,
      rules: [{
        id: 'scope.invalid',
        severity: 'error',
        engine: 'regex',
        applies_to: [scope],
        forbidden: ['FORBIDDEN'],
        message: 'invalid scope must fail configuration',
      }],
    });
    assert.ok(prepared.configErrors.some((error) => error.includes('applies_to')),
      `${scope}:\n${prepared.configErrors.join('\n')}`);

    const root = tmpDir();
    write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
    write(root, '.agentlintel/guard.json', JSON.stringify({
      version: 2,
      zones: [{ id: 'source', allow: ['src/**'] }],
      forbidden: [scope],
    }));
    const result = verify(root, { skipFixtures: true });
    assert.ok(result.errors.some((error) =>
      error.includes('KERNEL-SCHEMA') && error.includes('forbidden')),
    `${scope}:\n${result.errors.join('\n')}`);
  }
});

test('missing core contract files are explicit strict-mode failures', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  const files = {
    '.agentlintel/facts.yaml': 'version: 2\nfacts:\n  - { id: source, claim: source, check: { type: path_exists, path: src/a.ts } }\n',
    '.agentlintel/rules.yaml': 'version: 2\nrules: []\n',
    '.agentlintel/exemplars.yaml': 'version: 2\nexemplars:\n  - { id: source, shape: module, path: src/a.ts, demonstrates: source layout }\n',
  };
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'contract', allow: ['.agentlintel/**', 'src/**'] }],
    forbidden: [],
  }));
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  for (const [rel, warning] of [
    ['.agentlintel/facts.yaml', 'FACTS-ABSENT'],
    ['.agentlintel/rules.yaml', 'RULES-ABSENT'],
    ['.agentlintel/exemplars.yaml', 'EXEMPLARS-ABSENT'],
  ]) {
    fs.unlinkSync(path.join(root, rel));
    const result = verify(root, { skipFixtures: true, strict: true });
    assert.ok(result.warnings.some((entry) => entry.includes(warning)), result.warnings.join('\n'));
    assert.strictEqual(result.ok, false);
    write(root, rel, files[rel]);
  }
});

test('malformed config is reported without crashing valid checks', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: arch.layers',
    '    severity: error',
    '    engine: layers',
    '    layers: [null]',
    '    allowed: {}',
  ].join('\n'));
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [null, { id: 'valid', allow: ['src/**'] }],
    forbidden: [],
  }));
  write(root, '.agentlintel/exemplars.yaml', 'version: 2\nexemplars:\n  -\n');
  write(root, 'src/a.ts', 'export {}');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('a layer must be an object')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('zones[0] must be an object')), result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('exemplar must be an object')), result.errors.join('\n'));

  const aliasFindings = detectRuleWeakening(
    { rules: [{ id: 'arch.layers', aliases: { '@': 'src' } }] },
    { rules: [{ id: 'arch.layers', aliases: 'invalid' }] },
  );
  assert.ok(aliasFindings.some((finding) => finding.includes("changed alias '@'")), aliasFindings.join('\n'));
});

test('rule config rejects suppression ambiguity, duplicate layers, and unsafe ids/options', () => {
  const set = preparedRuleSet({ rules: [
    { id: 'first_exemption', severity: 'error', engine: 'exemptions', required_fields: ['Reason', 'Expires', 'Decision'], within_lines: 1, message: 'm' },
    { id: 'second.exemption', severity: 'error', engine: 'exemptions', required_fields: ['Reason', 'Expires', 'Decision'], within_lines: 1, message: 'm' },
    {
      id: 'arch.layers', severity: 'error', engine: 'layers',
      layers: [{ name: 'domain', path: ['src/domain/**'] }, { name: 'domain', path: ['src/other/**'] }],
      allowed: { domain: [] },
      message: 'm',
    },
    { id: 'external.bad-timeout', severity: 'error', engine: 'external', run: 'tool', timeout_ms: -1, message: 'm' },
    { id: 'external.nul', severity: 'error', engine: 'external', run: '\0', message: 'm' },
    { id: 'con.rule', severity: 'error', engine: 'regex', forbidden: ['x'], message: 'm' },
    { id: 'underscore_rule', severity: 'error', engine: 'regex', forbidden: ['x'], message: 'm' },
    { id: 'missing.expiry', severity: 'error', engine: 'exemptions', required_fields: ['Reason'], within_lines: 1, message: 'm' },
    { id: 'bad.must-match', severity: 'error', engine: 'regex', forbidden: ['x'], must_match: 'false', message: 'm' },
    { id: 'missing.message', severity: 'error', engine: 'regex', forbidden: ['x'] },
    { id: 'regex.empty', severity: 'error', engine: 'regex', forbidden: [], required: [], message: 'm' },
    { id: 'regex.bad-required', severity: 'error', engine: 'regex', required: [''], message: 'm' },
    { id: 'regex.bad-match', severity: 'error', engine: 'regex', required: ['x'], match: 'tree', message: 'm' },
    { id: 'regex.bad-when', severity: 'error', engine: 'regex', forbidden: ['x'], when: ['trigger'], message: 'm' },
  ] });
  assert.ok(set.configErrors.some((error) => error.includes('at most one exemptions rule')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes("duplicate layer name 'domain'")), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('timeout_ms')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[external.nul]') && error.includes('require run')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[con.rule] id')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[missing.expiry]') && error.includes('Expires')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[bad.must-match]') && error.includes('boolean')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[missing.message]') && error.includes('message')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[regex.empty]') && error.includes('forbidden or required')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[regex.bad-required]') && error.includes('required')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[regex.bad-match]') && error.includes('line or file')), set.configErrors.join('\n'));
  assert.ok(set.configErrors.some((error) => error.includes('[regex.bad-when]') && error.includes('requires positive')), set.configErrors.join('\n'));
  assert.ok(set.all.some((rule) => rule.id === 'underscore_rule'), set.configErrors.join('\n'));
});

test('layer order, coverage, and new aliases are ratcheted', () => {
  const oldRule = {
    id: 'arch.layers', engine: 'layers',
    layers: [{ name: 'ui', path: ['src/ui/**'] }, { name: 'domain', path: ['src/domain/**'] }],
    allowed: { ui: [] },
    aliases: {},
  };
  const newRule = {
    ...oldRule,
    layers: [{ name: 'domain', path: ['src/domain/**'] }, { name: 'ui', path: ['src/ui/**', 'src/**'] }],
    aliases: { 'src/': 'outside/' },
  };
  const findings = detectRuleWeakening({ rules: [oldRule] }, { rules: [newRule] });
  for (const expected of ['layer order or membership', 'coverage by adding', 'potentially shadowing alias'])
    assert.ok(findings.some((finding) => finding.includes(expected)), `${expected}:\n${findings.join('\n')}`);
});

test('introducing the first suppression provider is a weakening', () => {
  const findings = detectRuleWeakening(
    { rules: [{ id: 'code.rule', engine: 'regex', forbidden: ['x'] }] },
    { rules: [
      { id: 'code.rule', engine: 'regex', forbidden: ['x'] },
      { id: 'exemption.rule', engine: 'exemptions', required_fields: ['Expires'] },
    ] },
  );
  assert.ok(findings.some((finding) => finding.includes('can suppress')),
    findings.join('\n'));
});

test('strict verification fails when Git cannot enforce the guard and ratchets', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'all', allow: ['**/*'] }],
    forbidden: [],
  }));
  const result = verify(root, { skipFixtures: true, strict: true });
  assert.strictEqual(result.ok, false);
  assert.ok(result.warnings.some((w) => w.includes('GUARD-VCS')), result.warnings.join('\n'));
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
  for (const rel of ['src/main.cpp', 'src/module.mjs', 'src/module.cjs'])
    write(root, rel, 'NATIVE_FORBIDDEN\n');
  const result = verify(root, { skipFixtures: true });
  for (const rel of ['src/main.cpp', 'src/module.mjs', 'src/module.cjs'])
    assert.ok(result.errors.some((e) => e.includes('native.no-forbidden') && e.includes(rel)), `${rel}:\n${result.errors.join('\n')}`);
});

test('Git index symlinks and gitlinks fail only when they are governed evidence', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, 'README.md', 'root\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  const head = git(root, 'rev-parse HEAD').trim();

  write(root, 'docs/latest.md', 'README.md\n');
  const linkBlob = git(root, 'hash-object -w docs/latest.md').trim();
  git(root, `update-index --add --cacheinfo 120000,${linkBlob},docs/latest.md`);
  fs.mkdirSync(path.join(root, 'deps', 'lib'), { recursive: true });
  git(root, `update-index --add --cacheinfo 160000,${head},deps/lib`);

  let result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.tracked_nonregular.length, 2);
  assert.ok(!result.errors.some((error) => error.includes('NONREGULAR') || error.includes('scan-failure')),
    result.errors.join('\n'));

  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: python.global',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.py"]',
    '    forbidden: ["FORBIDDEN"]',
    '    message: "scan all Python source"',
  ].join('\n'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 160000') && error.includes('deps/lib')),
    result.errors.join('\n'));

  write(root, '.agentlintel/rules.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/rules.yaml'), 'utf8',
  ).replace('    forbidden:', '    excludes: ["deps/lib"]\n    forbidden:'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 160000') && error.includes('deps/lib')),
    'an exact file exclusion must not waive an opaque directory boundary');

  write(root, '.agentlintel/rules.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/rules.yaml'), 'utf8',
  ).replace('excludes: ["deps/lib"]', 'excludes: ["deps/lib/**"]'));
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('Git mode 160000') && error.includes('deps/lib')),
    result.errors.join('\n'));

  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.scan',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["deps/**"]',
    '    forbidden: ["FORBIDDEN"]',
    '    message: "scan dependency boundary"',
  ].join('\n'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 160000') && error.includes('deps/lib')),
    result.errors.join('\n'));

  fs.mkdirSync(path.join(root, 'link-target'), { recursive: true });
  write(root, 'link-target/bad.py', 'FORBIDDEN\n');
  write(root, 'src/link', '../link-target\n');
  const dirLinkBlob = git(root, 'hash-object -w src/link').trim();
  git(root, `update-index --add --cacheinfo 120000,${dirLinkBlob},src/link`);
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: python.scan',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.py"]',
    '    forbidden: ["FORBIDDEN"]',
    '    message: "scan Python source"',
  ].join('\n'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 120000') && error.includes('src/link')),
    result.errors.join('\n'));

  write(root, '.agentlintel/rules.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/rules.yaml'), 'utf8',
  ).replace('    forbidden:', '    excludes: ["src/link/**/__agentlintel__.*"]\n    forbidden:'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 120000') && error.includes('src/link')),
    'a crafted descendant exclusion must not waive the boundary');

  write(root, '.agentlintel/rules.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/rules.yaml'), 'utf8',
  ).replace('excludes: ["src/link/**/__agentlintel__.*"]', 'excludes: ["src/link"]'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('Git mode 120000') && error.includes('src/link')),
    'an exact file exclusion must not waive a directory symlink');

  write(root, '.agentlintel/rules.yaml', fs.readFileSync(
    path.join(root, '.agentlintel/rules.yaml'), 'utf8',
  ).replace('excludes: ["src/link"]', 'excludes: ["src/link/**"]'));
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('Git mode 120000') && error.includes('src/link')),
    result.errors.join('\n'));

  write(root, 'deps/lib/proof.txt', 'mutable checkout evidence\n');
  write(root, '.agentlintel/facts.yaml', [
    'version: 2',
    'facts:',
    '  - id: opaque-proof',
    '    claim: "proof is fixed"',
    '    check: { type: file_contains, path: deps/lib/proof.txt, pattern: evidence }',
  ].join('\n'));
  write(root, '.agentlintel/exemplars.yaml', [
    'version: 2',
    'exemplars:',
    '  - id: opaque-example',
    '    shape: module',
    '    path: deps/lib/proof.txt',
    '    demonstrates: "external mutable code"',
  ].join('\n'));
  result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('STALE FACT') && error.includes('opaque Git mode 160000')),
    result.errors.join('\n'));
  assert.ok(result.errors.some((error) => error.includes('EXEMPLAR') && error.includes('opaque Git mode 160000')),
    result.errors.join('\n'));

  for (const bypass of ['foo/../deps/lib/proof.txt', 'deps//lib/proof.txt']) {
    write(root, '.agentlintel/facts.yaml', [
      'version: 2',
      'facts:',
      '  - id: opaque-proof',
      '    claim: "proof is fixed"',
      `    check: { type: file_contains, path: ${bypass}, pattern: evidence }`,
    ].join('\n'));
    result = verify(root, { skipFixtures: true });
    assert.ok(result.errors.some((error) => error.includes('STALE FACT') && error.includes('canonical')),
      `${bypass}:\n${result.errors.join('\n')}`);
  }
});

test('ignored or untracked governance cannot masquerade as committed policy', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, 'README.md', 'tracked source\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'),
    '\n.agentlintel/\n.agents/\nAGENTS.md\nCLAUDE.md\n');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agents/skills/example/SKILL.md', '---\nname: example\ndescription: example\n---\n');
  write(root, 'AGENTS.md', '# ignored policy\n');
  write(root, 'CLAUDE.md', '@AGENTS.md\n');

  const result = verify(root, { skipFixtures: true, base: 'HEAD', strict: true });
  for (const file of [
    '.agentlintel/rules.yaml',
    '.agents/skills/example/SKILL.md',
    'AGENTS.md',
    'CLAUDE.md',
  ])
    assert.ok(result.warnings.some((warning) =>
      warning.includes('GOVERNANCE-UNTRACKED') && warning.includes(file)),
    `${file}:\n${result.warnings.join('\n')}`);
  assert.strictEqual(result.ok, false);
});

test('partial and hidden Git index state cannot masquerade as a full tree gate', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, 'src/a.ts', 'export {};\n');
  git(root, 'add -A');
  git(root, 'commit -q -m init');

  git(root, 'update-index --skip-worktree src/a.ts');
  let result = verify(root, { skipFixtures: true, base: 'HEAD' });
  assert.ok(result.errors.some((error) => error.includes('sparse checkout')),
    result.errors.join('\n'));

  git(root, 'update-index --no-skip-worktree src/a.ts');
  git(root, 'update-index --assume-unchanged .agentlintel/rules.yaml');
  result = verify(root, { skipFixtures: true, base: 'HEAD' });
  assert.ok(result.errors.some((error) => error.includes('assume-unchanged')),
    result.errors.join('\n'));
});

test('oversized applicable files fail closed instead of disappearing from the scan', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: scan.required',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.js"]',
    '    forbidden: ["FORBIDDEN"]',
    '    message: "scan every source"',
  ].join('\n'));
  write(root, 'src/large.js', 'FORBIDDEN\n' + 'x'.repeat(2097152));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('agentlintel.scan-limit') && error.includes('large.js')), result.errors.join('\n'));
});

test('Git refs and changed path bytes are handled without an invented path rewrite', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'src', allow: ['src/**'] }],
    forbidden: [],
  }));
  write(root, 'src/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  git(root, 'branch feature/c++');
  const result = verify(root, { skipFixtures: true, base: 'feature/c++' });
  assert.ok(!result.warnings.some((warning) => warning.includes('GUARD-BASE')), result.warnings.join('\n'));

  const exactPath = checkGuard(root, {
    version: 2,
    zones: [{ id: 'src', allow: ['src/**'] }],
    forbidden: [],
  }, { changed: { files: ['src\\evil.ts'], baseResolved: true, note: '' } });
  assert.strictEqual(exactPath.violations.length, 1, 'a literal backslash is not a POSIX path separator');

  const newlinePath = checkGuard(root, {
    version: 2,
    zones: [{ id: 'all', allow: ['**/*'] }],
    forbidden: ['**/node_modules/**'],
  }, { changed: { files: ['x/node_modules/evil\n.js'], baseResolved: true, note: '' } });
  assert.ok(newlinePath.violations.some((violation) => violation.rule === 'guard.forbidden'));
});

test('guard scope uses the full inventory and recognizes literal tightening', () => {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/facts.yaml', 'version: 2\nfacts:\n  - { id: fixture, claim: fixture, check: { type: path_exists, path: .agentlintel/conformance/x/cases/pass/a.ts } }\n');
  write(root, '.agentlintel/rules.yaml', 'version: 2\nrules: []\n');
  write(root, '.agentlintel/exemplars.yaml', 'version: 2\nexemplars:\n  - { id: fixture, shape: fixture, path: .agentlintel/conformance/x/cases/pass/a.ts, demonstrates: fixture layout }\n');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'fixtures', allow: ['.agentlintel/conformance/**'] }],
    forbidden: [],
  }));
  write(root, '.agentlintel/conformance/x/cases/pass/a.ts', 'export {}');
  git(root, 'add -A');
  git(root, 'commit -q -m init');
  let result = verify(root, { skipFixtures: true, strict: true });
  assert.ok(!result.warnings.some((warning) => warning.includes('GUARD-SCOPE')), result.warnings.join('\n'));

  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'readme', allow: ['*.md'] }],
    forbidden: [],
  }));
  write(root, 'README.md', 'x');
  git(root, 'add -A');
  git(root, 'commit -q -m wildcard');
  write(root, '.agentlintel/guard.json', JSON.stringify({
    version: 2,
    zones: [{ id: 'readme', allow: ['README.md'] }],
    forbidden: [],
  }));
  result = verify(root, { skipFixtures: true });
  assert.ok(!result.errors.some((error) => error.includes('RATCHET [guard.json]')), result.errors.join('\n'));
});

test('retired hook and private skill paths cannot linger silently', () => {
  const root = tmpDir();
  write(root, '.agentlintel/hooks/pretooluse-hook.sh', '# old hook\n');
  fs.mkdirSync(path.join(root, '.agentlintel/skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ai-governance'), { recursive: true });
  const results = checkAdapters(root);
  assert.ok(results.some((entry) => entry.file.includes('pretooluse-hook') && !entry.ok));
  assert.ok(results.some((entry) => entry.file === '.agentlintel/skills' && !entry.ok));
  assert.ok(results.some((entry) => entry.file === '.ai-governance' && !entry.ok));
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

test('line_count_max counts logical lines without a trailing empty line', () => {
  const root = tmpDir();
  write(root, 'exact.md', 'a\nb\nc\n');
  const results = verifyFacts(root, {
    facts: [{ id: 'x', claim: 'exactly 3', check: { type: 'line_count_max', path: 'exact.md', max: 3 } }],
  });
  assert.strictEqual(results[0].ok, true, results[0].detail);
});
