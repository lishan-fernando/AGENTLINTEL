// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { verify } = require('../src/lib/verify');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

test('external engine maps JSONL output to violations under the rule id', () => {
  const root = tmpDir();
  const emit = 'node -e "console.log(JSON.stringify({file:\'src/a.ts\',line:3,message:\'cycle detected\'}))"';
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    `    run: ${JSON.stringify(emit)}`,
    '    message: "dependency rule"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  const v = result.rule_violations.find((x) => x.rule === 'deps.no-cycles');
  assert.ok(v);
  assert.strictEqual(v.file, 'src/a.ts');
  assert.strictEqual(v.line, 3);
  assert.ok(result.errors.some((e) => e.includes('deps.no-cycles')));
  const skipped = verify(root, { skipFixtures: true, run: false });
  assert.strictEqual(skipped.rule_violations.length, 0, '--no-run skips external engines');
});

test('--no-run external rules warn and fail strict mode instead of silently passing', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    '    run: "node -e \\"process.exit(0)\\""',
    '    message: "dependency rule"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true, run: false });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('NO-RUN RULE [deps.no-cycles]')));
  assert.strictEqual(verify(root, { skipFixtures: true, run: false, strict: true }).ok, false);
});

test('external engine fails CLOSED when the tool is missing or exits abnormally', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    '    run: "definitely-not-a-real-command-xyz --scan"',
    '    message: "dependency rule"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false, 'a missing engine must not read as a clean pass');
  assert.ok(result.errors.some((e) => e.includes('did not run cleanly')), result.errors.join('\n'));
});

test('external engine exit 1 WITH parsed findings is findings, not engine failure', () => {
  const root = tmpDir();
  const emit = 'node -e "console.log(JSON.stringify({file:\'a.ts\',line:1,message:\'boom\'})); process.exit(1)"';
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    `    run: ${JSON.stringify(emit)}`,
    '    message: "dependency rule"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('a.ts:1')), 'findings reported');
  assert.ok(!result.errors.some((e) => e.includes('did not run cleanly')), 'no engine-failure error');
});

test('command-status adapter maps exit 1 output to a policy violation', () => {
  const root = tmpDir();
  write(root, 'policy.js', [
    'console.error("commit subject must start with feat: or fix:");',
    'process.exit(1);',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: commit.message-format',
    '    severity: error',
    '    engine: external',
    '    adapter: command-status',
    '    scope: commit',
    '    run: "node policy.js"',
    '    message: "Commit policy failed."',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  const v = result.rule_violations.find((x) => x.rule === 'commit.message-format');
  assert.ok(v);
  assert.strictEqual(v.file, '(commit-policy)');
  assert.match(v.message, /Commit policy failed.*commit subject/);
  assert.ok(!result.errors.some((e) => e.includes('did not run cleanly')), result.errors.join('\n'));
});

test('command-status external fixtures replay recorded status', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: pr.title-format',
    '    severity: error',
    '    engine: external',
    '    adapter: command-status',
    '    scope: pr',
    '    run: "node .agentlintel/adapters/github-pr-policy.js"',
    '    message: "PR policy failed."',
  ].join('\n'));
  write(root, '.agentlintel/conformance/pr.title-format/cases/fail-title/status.txt', '1\n');
  write(root, '.agentlintel/conformance/pr.title-format/cases/fail-title/output.jsonl', 'PR title does not match policy\n');
  write(root, '.agentlintel/conformance/pr.title-format/cases/fail-title/expected.yaml', [
    'violations:',
    '  - rule: pr.title-format',
    '    file: "(pr-policy)"',
    '    message_contains: "PR policy failed"',
  ].join('\n'));
  const result = verify(root, { run: false });
  assert.deepStrictEqual(result.fixtures.filter((f) => !f.ok), []);
});

test('GitHub PR policy checks title, body, and size limits', () => {
  const root = tmpDir();
  const event = path.join(root, 'event.json');
  write(root, 'event.json', JSON.stringify({
    pull_request: { title: 'misc update', body: '', changed_files: 51, additions: 1000, deletions: 300 },
  }));
  const script = path.join(__dirname, '..', 'templates', 'engine-adapters', 'github-pr-policy.js');
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, GITHUB_EVENT_PATH: event },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /PR title/);
  assert.match(r.stderr, /description/);
  assert.match(r.stderr, /files/);
  assert.match(r.stderr, /lines/);
});

test('dependency-cruiser adapter maps JSON output to AgentLintel violations', () => {
  const root = tmpDir();
  write(root, 'emit-depcruise.js', [
    'console.log(JSON.stringify({',
    '  modules: [{',
    '    source: "src/components/login-form.tsx",',
    '    dependencies: [{',
    '      resolved: "src/features/auth/hooks.ts",',
    '      rules: [{ name: "agentlintel/no-feature-internal-imports-from-app", severity: "error", comment: "Use the feature index." }]',
    '    }]',
    '  }]',
    '}, null, 2));',
    'process.exit(1);',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: frontend.feature-public-surface',
    '    severity: error',
    '    engine: external',
    '    adapter: dependency-cruiser',
    '    run: "node emit-depcruise.js"',
    '    message: "Feature internals are private."',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('frontend.feature-public-surface')), result.errors.join('\n'));
  const v = result.rule_violations.find((x) => x.rule === 'frontend.feature-public-surface');
  assert.strictEqual(v.file, 'src/components/login-form.tsx');
  assert.match(v.message, /src\/components\/login-form\.tsx -> src\/features\/auth\/hooks\.ts/);
});

test('dotnet-test adapter reports failing architecture tests under the rule id', () => {
  const root = tmpDir();
  write(root, 'fail-dotnet.js', [
    'console.log("Failed ExampleApi.Architecture.Tests.DomainPurityTests.Domain_types_reference_no_infrastructure_namespace [17 ms]");',
    'console.log("Test Run Failed.");',
    'process.exit(1);',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: dotnet.architecture-tests',
    '    severity: error',
    '    engine: external',
    '    adapter: dotnet-test',
    '    run: "node fail-dotnet.js"',
    '    message: ".NET architecture tests must pass."',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('dotnet.architecture-tests')), result.errors.join('\n'));
  assert.ok(!result.errors.some((e) => e.includes('did not run cleanly')), 'test failure is a rule finding, not an engine failure');
  const v = result.rule_violations.find((x) => x.rule === 'dotnet.architecture-tests');
  assert.strictEqual(v.file, '(dotnet-test)');
  assert.match(v.message, /DomainPurityTests/);
});

test('dotnet-test adapter does not flag successful xUnit summaries', () => {
  const root = tmpDir();
  write(root, 'pass-dotnet.js', [
    'console.log("Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7, Duration: 1 s - ExampleApi.Architecture.Tests.dll (net10.0)");',
    'process.exit(0);',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: dotnet.architecture-tests',
    '    severity: error',
    '    engine: external',
    '    adapter: dotnet-test',
    '    run: "node pass-dotnet.js"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.deepStrictEqual(result.rule_violations, []);
  assert.strictEqual(result.ok, true);
});

test('dotnet-test adapter fixtures map captured failed test output', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: dotnet.architecture-tests',
    '    severity: error',
    '    engine: external',
    '    adapter: dotnet-test',
    '    run: "dotnet test Tests/Architecture.Tests/Architecture.Tests.csproj --no-restore"',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/fail-domain/output.jsonl', [
    'Failed ExampleApi.Architecture.Tests.DomainPurityTests.Domain_types_reference_no_infrastructure_namespace [17 ms]',
    'Test Run Failed.',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/fail-domain/expected.yaml', [
    'violations:',
    '  - rule: dotnet.architecture-tests',
    '    file: "(dotnet-test)"',
    '    message_contains: "DomainPurityTests"',
  ].join('\n'));
  const result = verify(root, { run: false });
  assert.deepStrictEqual(result.fixtures.filter((f) => !f.ok), []);
});
