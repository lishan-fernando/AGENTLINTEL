// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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

test('migration normalizes safe Windows paths and quarantines unsafe paths', () => {
  const root = tmpDir();
  write(root, '.ai-governance/context.yaml', [
    'version: 1',
    'primitives:',
    '  result: { path: "src\\\\shared\\\\result.ts" }',
    '  execution_context: { path: "C:\\\\outside\\\\context.ts" }',
    'exemplars:',
    '  - { name: Safe, path: "slices\\\\Safe" }',
    '  - { name: Unsafe, path: "../outside" }',
  ].join('\n'));
  write(root, '.ai-governance/architecture.guard.json', JSON.stringify({
    zones: [{ id: 'source', allow: ['src\\**', 'src/{a,b}/**'] }],
    forbidden: ['secrets\\**'],
  }));

  const migrated = migrate(root);
  assert.strictEqual(migrated.ok, true, migrated.log.join('\n'));
  const facts = YAML.parse(migrated.files['.agentlintel/facts.yaml']).facts;
  assert.strictEqual(facts.find((fact) => fact.id === 'result-primitive').check.path,
    'src/shared/result.ts');
  const unsafeFact = facts.find((fact) => fact.id === 'execution-context');
  assert.strictEqual(unsafeFact.check.type, 'pending');
  assert.match(unsafeFact.check.note, /not a safe repository-relative path/);

  const exemplars = YAML.parse(
    migrated.files['.agentlintel/exemplars.yaml'],
  ).exemplars;
  assert.deepStrictEqual(exemplars.map((entry) => entry.path), ['slices/Safe']);
  const guard = JSON.parse(migrated.files['.agentlintel/guard.json']);
  assert.deepStrictEqual(guard.zones[0].allow, ['src/**']);
  assert.deepStrictEqual(guard.forbidden, ['secrets/**']);
  assert.match(migrated.files['.agentlintel/MIGRATION.md'], /Skipped 1 unsafe/);
  assert.match(migrated.files['.agentlintel/MIGRATION.md'], /unsupported guard scopes omitted/);
});

test('migration fails rather than dropping an unrepresentable forbidden scope', () => {
  const root = tmpDir();
  write(root, '.ai-governance/context.yaml', 'version: 1\n');
  write(root, '.ai-governance/architecture.guard.json', JSON.stringify({
    zones: [{ id: 'secret', allow: ['secret/**'] }],
    forbidden: ['secret/{prod,stage}/**'],
  }));
  const migrated = migrate(root);
  assert.strictEqual(migrated.ok, false);
  assert.ok(migrated.log.some((line) =>
    line.includes('forbidden scope') && line.includes('cannot represent safely')),
  migrated.log.join('\n'));
  assert.deepStrictEqual(migrated.files, {});
});

test('migration emits valid empty registries and preserves forbidden-only guards', () => {
  const root = tmpDir();
  write(root, '.ai-governance/context.yaml', [
    'version: 1',
    'verification: { commands: {} }',
    'exemplars: {}',
  ].join('\n'));
  write(root, '.ai-governance/architecture.guard.json', JSON.stringify({
    zones: [{ id: 'empty', allow: [] }],
    forbidden: ['secrets/**'],
  }));
  const migrated = migrate(root);
  assert.strictEqual(migrated.ok, true, migrated.log.join('\n'));
  assert.deepStrictEqual(YAML.parse(migrated.files['.agentlintel/facts.yaml']).facts, []);
  assert.deepStrictEqual(YAML.parse(migrated.files['.agentlintel/exemplars.yaml']).exemplars, []);
  const guard = JSON.parse(migrated.files['.agentlintel/guard.json']);
  assert.deepStrictEqual(guard.forbidden, ['secrets/**']);
  assert.deepStrictEqual(guard.zones, [{ id: 'migration-review', allow: ['**/*'] }]);
});

test('workspace membership is machine-verified; empty or broken lists fail', () => {
  const root = tmpDir();
  write(root, 'agentlintel.workspace.yaml', 'members: []');
  assert.ok(loadWorkspace(root).errors.length >= 1, 'empty member list fails');

  write(root, 'agentlintel.workspace.yaml', ['members:', '  - good-repo', '  - missing-repo', '  - no-git-repo', '  - fake-git-repo'].join('\n'));
  fs.mkdirSync(path.join(root, 'good-repo'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: path.join(root, 'good-repo') });
  fs.mkdirSync(path.join(root, 'good-repo', '.agentlintel'), { recursive: true });
  fs.mkdirSync(path.join(root, 'no-git-repo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'fake-git-repo', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'fake-git-repo', '.agentlintel'), { recursive: true });
  const ws = loadWorkspace(root);
  assert.strictEqual(ws.members.length, 1);
  assert.strictEqual(ws.members[0].path, 'good-repo');
  assert.strictEqual(ws.errors.length, 3);
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
  assert.match(m.files['.agentlintel/MIGRATION.md'], /Delete the entire `.ai-governance\/` source tree/);
});

test('init && verify passes out of the box (the 30-minute promise)', () => {
  const root = tmpDir();
  const r = init(root, {});
  assert.strictEqual(r.ok, true, r.log.join('\n'));
  const result = verify(root, {});
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((warning) => warning.includes('FACTS-EMPTY')));
  assert.ok(result.warnings.some((warning) => warning.includes('EXEMPLARS-EMPTY')));
  const fixtureFails = result.fixtures.filter((f) => !f.ok);
  assert.deepStrictEqual(fixtureFails, [], 'scaffolded fixtures are green');
  assert.ok(result.fixtures.length >= 20, 'fixtures actually scaffolded');
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').trim(), '@AGENTS.md');
  assert.ok(fs.existsSync(path.join(root, '.agents', 'skills', 'mirror-exemplar', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(root, '.agentlintel', 'skills')), 'init must not write the legacy skills path');
});

test('init refuses to write through an indexed gitlink boundary', () => {
  const root = tmpDir();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
  write(root, 'README.md', 'root\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  fs.mkdirSync(path.join(root, '.agentlintel'), { recursive: true });
  execFileSync('git', [
    'update-index',
    '--add',
    '--cacheinfo',
    `160000,${head},.agentlintel`,
  ], { cwd: root });

  const result = init(root, {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.log.some((line) =>
    line.includes('Git mode 160000') && line.includes('.agentlintel')),
  result.log.join('\n'));
  assert.ok(!fs.existsSync(path.join(root, '.agentlintel', 'rules.yaml')));

  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';
    const withoutGit = init(root, {});
    assert.strictEqual(withoutGit.ok, false);
    assert.ok(withoutGit.log.some((line) =>
      line.includes('Git metadata') && line.includes('could not be inspected')),
    withoutGit.log.join('\n'));
  } finally {
    process.env.PATH = originalPath;
  }
});

test('init reports a non-directory output ancestor without throwing', () => {
  const root = tmpDir();
  write(root, '.agentlintel', 'not a directory\n');
  const result = init(root, {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.log.some((line) => line.includes('not a directory')),
    result.log.join('\n'));
});

test('init refuses a nested directory inside another Git repository', () => {
  const root = tmpDir();
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, 'app'));
  const result = init(path.join(root, 'app'), {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.log.some((line) => line.includes('Git top-level')),
    result.log.join('\n'));
  assert.ok(!fs.existsSync(path.join(root, 'app', '.agentlintel')));
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

test('init --hooks writes a fail-closed Stop hook template', () => {
  const root = tmpDir();
  const r = init(root, { hooks: true });
  assert.strictEqual(r.ok, true, r.log.join('\n'));
  const stopHook = path.join(root, '.agentlintel', 'hooks', 'verify-hook.sh');
  assert.ok(fs.existsSync(stopHook));
  assert.match(fs.readFileSync(stopHook, 'utf8'), /CLI not found/);
  assert.ok(!fs.existsSync(path.join(root, '.agentlintel', 'hooks', 'pretooluse-hook.sh')));
  assert.strictEqual(verify(root, {}).ok, true);
  fs.appendFileSync(stopHook, '\nExtra local rule\n');
  const drifted = verify(root, {});
  assert.ok(drifted.errors.some((e) => e.includes('verify-hook.sh')), 'drifted Stop hook fails the gate');
});

test('CLI templates for fixtures and skills are byte-identical to the kernel', () => {
  const repo = path.join(__dirname, '..', '..', '..');
  for (const pair of [
    ['.agentlintel/conformance', 'tools/agentlintel-cli/templates/conformance'],
    ['.agents/skills', 'tools/agentlintel-cli/templates/skills'],
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

test('standard skill frontmatter is discoverable and matches its directory', () => {
  const repo = path.join(__dirname, '..', '..', '..');
  const skillsRoot = path.join(repo, '.agents', 'skills');
  for (const directory of fs.readdirSync(skillsRoot)) {
    const content = fs.readFileSync(path.join(skillsRoot, directory, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(match, `${directory} needs YAML frontmatter`);
    const frontmatter = YAML.parse(match[1]);
    assert.strictEqual(frontmatter.name, directory, `${directory} name must match its directory`);
    assert.ok(typeof frontmatter.description === 'string' && frontmatter.description.trim(), `${directory} needs a description`);
  }
});
