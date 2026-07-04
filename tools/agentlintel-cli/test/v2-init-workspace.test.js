// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');

const { verify } = require('../src/lib/verify');
const { loadWorkspace } = require('../src/lib/workspace');
const { migrate } = require('../src/commands/migrate');
const { init } = require('../src/commands/init');
const { walk } = require('../src/lib/io');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

test('migrated multi-line v1 commands produce parseable YAML', () => {
  const root = tmpDir();
  write(root, '.ai-governance/context.yaml', [
    'version: 1',
    'verification:',
    '  commands:',
    '    - id: build',
    '      command: |',
    '        dotnet build',
    '        dotnet test',
  ].join('\n'));
  const m = migrate(root);
  const doc = YAML.parse(m.files['.agentlintel/facts.yaml']);
  assert.strictEqual(doc.facts.length, 1);
  assert.match(doc.facts[0].check.run, /dotnet build\ndotnet test/);
});

test('workspace membership is machine-verified; empty or broken lists fail', () => {
  const root = tmpDir();
  write(root, 'agentlintel.workspace.yaml', 'members: []');
  assert.ok(loadWorkspace(root).errors.length >= 1, 'empty member list fails');

  write(root, 'agentlintel.workspace.yaml', ['members:', '  - good-repo', '  - missing-repo', '  - no-git-repo'].join('\n'));
  fs.mkdirSync(path.join(root, 'good-repo', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'good-repo', '.agentlintel'), { recursive: true });
  fs.mkdirSync(path.join(root, 'no-git-repo'), { recursive: true });
  const ws = loadWorkspace(root);
  assert.strictEqual(ws.members.length, 1);
  assert.strictEqual(ws.members[0].path, 'good-repo');
  assert.strictEqual(ws.errors.length, 2);
  assert.ok(ws.errors.some((e) => e.includes('missing-repo')));
  assert.ok(ws.errors.some((e) => e.includes('not a git repository')));
});

test('init --from-v1 migrates a v1 layout into pending-honest v2 drafts', () => {
  const root = tmpDir();
  write(root, '.ai-governance/context.yaml', [
    'version: 1',
    'project: { name: sample, package_manager: pnpm }',
    'primitives:',
    '  result: { status: required, path: src/shared/result.ts }',
    'validation: { status: required, library: Zod }',
    'errors: { status: required, catalog_path: slices/Cap/contract/errors.ts, pattern: "<SLICE>-(VAL|RULE)-NNN" }',
    'exemplars:',
    '  - { name: Capability, path: slices/Capability, why: canonical CRUD slice }',
    'verification:',
    '  commands:',
    '    - { id: test, command: "pnpm test", required: true }',
  ].join('\n'));
  write(root, '.ai-governance/architecture.guard.json', JSON.stringify({
    zones: [{ id: 'app', allow: ['src/**'] }],
    forbidden: ['**/node_modules/**'],
    forbiddenImports: [{ pattern: 'fetch\\(', reason: 'use http client' }],
  }));
  const m = migrate(root);
  assert.strictEqual(m.ok, true);
  const facts = m.files['.agentlintel/facts.yaml'];
  assert.match(facts, /result-primitive/);
  assert.match(facts, /type: pending/, 'unverifiable claims become pending, never fake-green');
  assert.match(facts, /pnpm test/);
  assert.match(m.files['.agentlintel/exemplars.yaml'], /slices\/Capability/);
  assert.match(m.files['.agentlintel/guard.json'], /src\/\*\*/);
  assert.match(m.files['.agentlintel/MIGRATION.md'], /forbiddenImports/, 'unmapped v1 keys are reported, not dropped');
  assert.match(m.files['.agentlintel/MIGRATION.md'], /rule that does not run in CI/);
});

test('init && verify passes out of the box (the 30-minute promise)', () => {
  const root = tmpDir();
  const r = init(root, {});
  assert.strictEqual(r.ok, true, r.log.join('\n'));
  const result = verify(root, {});
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
  const fixtureFails = result.fixtures.filter((f) => !f.ok);
  assert.deepStrictEqual(fixtureFails, [], 'scaffolded fixtures are green');
  assert.ok(result.fixtures.length >= 20, 'fixtures actually scaffolded');
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'skills', 'mirror-exemplar', 'SKILL.md')));
});

test('init --adapters writes pointers and verify checks their sync', () => {
  const root = tmpDir();
  init(root, { adapters: true });
  const cursor = path.join(root, '.cursor', 'rules', 'agentlintel.mdc');
  assert.ok(fs.existsSync(cursor));
  assert.strictEqual(verify(root, {}).ok, true);
  fs.appendFileSync(cursor, '\nExtra rule someone added by hand\n');
  const drifted = verify(root, {});
  assert.ok(drifted.errors.some((e) => e.includes('ADAPTER')), 'drifted adapter fails the gate');
});

test('init --engine-adapters writes external engine starter templates', () => {
  const root = tmpDir();
  const r = init(root, { engineAdapters: true });
  assert.strictEqual(r.ok, true, r.log.join('\n'));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'dependency-cruiser.frontend.cjs')));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'commit-message-policy.js')));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'github-pr-policy.js')));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'external-rules.snippets.yaml')));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'conformance-snippets', 'commit.message-format', 'cases', 'fail-subject', 'expected.yaml')));
  assert.ok(fs.existsSync(path.join(root, '.agentlintel', 'adapters', 'conformance-snippets', 'pr.metadata-policy', 'cases', 'fail-metadata', 'expected.yaml')));
  assert.match(fs.readFileSync(path.join(root, '.agentlintel', 'adapters', 'external-rules.snippets.yaml'), 'utf8'), /adapter: dotnet-test/);
  assert.match(fs.readFileSync(path.join(root, '.agentlintel', 'adapters', 'external-rules.snippets.yaml'), 'utf8'), /scope: commit/);
  assert.strictEqual(verify(root, {}).ok, true);
});

test('CLI templates for fixtures and skills are byte-identical to the kernel', () => {
  const repo = path.join(__dirname, '..', '..', '..');
  for (const pair of [
    ['.agentlintel/conformance', 'tools/agentlintel-cli/templates/conformance'],
    ['.agentlintel/skills', 'tools/agentlintel-cli/templates/skills'],
  ]) {
    const a = path.join(repo, pair[0]);
    const b = path.join(repo, pair[1]);
    const filesA = walk(a);
    const filesB = walk(b);
    assert.deepStrictEqual(filesB, filesA, `${pair[1]} file list matches ${pair[0]}`);
    for (const f of filesA) {
      const ca = fs.readFileSync(path.join(a, f), 'utf8').replace(/\r\n/g, '\n');
      const cb = fs.readFileSync(path.join(b, f), 'utf8').replace(/\r\n/g, '\n');
      assert.strictEqual(cb, ca, `content differs: ${f}`);
    }
  }
});
