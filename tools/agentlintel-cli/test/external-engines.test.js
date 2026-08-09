// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const { verify } = require('../src/lib/verify');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function commitAll(root) {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@t.t']);
  git(root, ['config', 'user.name', 't']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture']);
}

test('every external starter rule ships matching green fixtures', () => {
  const root = tmpDir();
  const templates = path.join(__dirname, '..', 'templates', 'engine-adapters');
  const snippets = YAML.parse(fs.readFileSync(
    path.join(templates, 'external-rules.snippets.yaml'),
    'utf8',
  ));
  write(root, '.agentlintel/rules.yaml', YAML.stringify({ version: 2, rules: snippets }));
  fs.cpSync(
    path.join(templates, 'conformance-snippets'),
    path.join(root, '.agentlintel', 'conformance'),
    { recursive: true },
  );

  const result = verify(root, { run: false });
  assert.deepStrictEqual(result.fixtures.filter((fixture) => !fixture.ok), []);
  assert.deepStrictEqual(
    [...new Set(result.fixtures.map((fixture) => fixture.rule))].sort(),
    snippets.map((rule) => rule.id).sort(),
  );
});

test('dynamic checks do not run without a committed Git snapshot', () => {
  for (const unborn of [false, true]) {
    const root = tmpDir();
    write(root, 'write-marker.js',
      "require('node:fs').writeFileSync('marker.out', 'ran');\n");
    write(root, '.agentlintel/rules.yaml', [
      'version: 2',
      'rules:',
      '  - id: dynamic.marker',
      '    severity: error',
      '    engine: external',
      '    evidence: [".agentlintel/rules.yaml"]',
      '    adapter: command-status',
      '    run: "node write-marker.js"',
      '    message: "marker"',
    ].join('\n'));
    if (unborn) {
      git(root, ['init', '-q']);
      git(root, ['add', '-A']);
    }
    const result = verify(root, { skipFixtures: true });
    assert.ok(result.errors.some((error) => error.includes('DYNAMIC-INTEGRITY')),
      result.errors.join('\n'));
    assert.ok(!fs.existsSync(path.join(root, 'marker.out')),
      `${unborn ? 'unborn' : 'non-Git'} dynamic command was executed`);
  }
});

test('dynamic checks cannot mutate versionable evidence after the static scan', () => {
  const root = tmpDir();
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 't@t.t']);
  git(root, ['config', 'user.name', 't']);
  write(root, 'src/a.ts', 'SAFE\n');
  write(root, 'mutate.js', [
    "require('node:fs').writeFileSync('src/a.ts', 'BAD\\n');",
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: static.bad',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.ts"]',
    '    forbidden: ["BAD"]',
    '    message: "BAD is forbidden"',
    '  - id: dynamic.mutator',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: command-status',
    '    run: "node mutate.js"',
    '    message: "dynamic check"',
  ].join('\n'));
  git(root, ['add', '.agentlintel/rules.yaml', 'mutate.js']);
  git(root, ['commit', '-q', '-m', 'init']);

  const result = verify(root, { strict: true, base: 'HEAD', skipFixtures: true });
  assert.ok(!result.rule_violations.some((violation) => violation.rule === 'static.bad'),
    'the static scan intentionally happened before the mutator');
  assert.ok(result.errors.some((error) => error.includes('DYNAMIC-INTEGRITY')),
    result.errors.join('\n'));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(fs.readFileSync(path.join(root, 'src/a.ts'), 'utf8'), 'BAD\n');
});

test('external engine maps JSONL output to violations under the rule id', () => {
  const root = tmpDir();
  const emit = 'node -e "console.log(JSON.stringify({file:\'src/a.ts\',line:3,message:\'cycle detected\'}))"';
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    `    run: ${JSON.stringify(emit)}`,
    '    message: "dependency rule"',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    run: "node -e \\"process.exit(0)\\""',
    '    message: "dependency rule"',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true, run: false });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('NO-RUN RULE [deps.no-cycles]')));
  assert.strictEqual(verify(root, { skipFixtures: true, run: false, strict: true }).ok, false);
});

test('--diff reports external engines as skipped so strict cannot masquerade as complete', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: external.architecture',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    run: "node architecture-check.js"',
    '    message: "architecture command"',
  ].join('\n'));
  const local = verify(root, { diff: true, skipFixtures: true });
  assert.ok(local.warnings.some((warning) =>
    warning.includes('NO-RUN RULE [external.architecture] skipped (--diff)')),
  local.warnings.join('\n'));
  assert.strictEqual(verify(root, {
    diff: true,
    skipFixtures: true,
    strict: true,
  }).ok, false);
});

test('external engine fails CLOSED when the tool is missing or exits abnormally', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    run: "definitely-not-a-real-command-xyz --scan"',
    '    message: "dependency rule"',
  ].join('\n'));
  commitAll(root);
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false, 'a missing engine must not read as a clean pass');
  assert.ok(result.errors.some((e) => e.includes('did not run cleanly')), result.errors.join('\n'));
});

test('JSONL engines fail closed on non-JSON stdout even with exit 0', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: deps.no-cycles',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    run: "node -e \\"console.log(\'fatal: checker crashed\')\\""',
    '    message: "dependency rule"',
  ].join('\n'));
  commitAll(root);
  const result = verify(root, { skipFixtures: true });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('did not run cleanly')), result.errors.join('\n'));
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
    '    evidence: [".agentlintel/rules.yaml"]',
    `    run: ${JSON.stringify(emit)}`,
    '    message: "dependency rule"',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: command-status',
    '    scope: commit',
    '    run: "node policy.js"',
    '    message: "Commit policy failed."',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
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
  write(root, '.agentlintel/conformance/pr.title-format/cases/pass-title/status.txt', '0\n');
  write(root, '.agentlintel/conformance/pr.title-format/cases/pass-title/expected.yaml', 'violations: []\n');
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: dependency-cruiser',
    '    run: "node emit-depcruise.js"',
    '    message: "Feature internals are private."',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: dotnet-test',
    '    run: "node fail-dotnet.js"',
    '    message: ".NET architecture tests must pass."',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: dotnet-test',
    '    run: "node pass-dotnet.js"',
    '    message: ".NET architecture tests must pass."',
  ].join('\n'));
  commitAll(root);
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
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: dotnet-test',
    '    run: "dotnet test Tests/Architecture.Tests/Architecture.Tests.csproj --no-restore"',
    '    message: ".NET architecture tests must pass."',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/fail-domain/output.jsonl', [
    'Failed ExampleApi.Architecture.Tests.DomainPurityTests.Domain_types_reference_no_infrastructure_namespace [17 ms]',
    'Test Run Failed.',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/fail-domain/status.txt', '1\n');
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/fail-domain/expected.yaml', [
    'violations:',
    '  - rule: dotnet.architecture-tests',
    '    file: "(dotnet-test)"',
    '    message_contains: "DomainPurityTests"',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/pass-domain/status.txt', '0\n');
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/pass-domain/output.jsonl', [
    'Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7',
  ].join('\n'));
  write(root, '.agentlintel/conformance/dotnet.architecture-tests/cases/pass-domain/expected.yaml', 'violations: []\n');
  const result = verify(root, { run: false });
  assert.deepStrictEqual(result.fixtures.filter((f) => !f.ok), []);
});

test('SARIF adapter maps diagnostic id, repository path, line, and column', () => {
  const root = tmpDir();
  write(root, 'emit-sarif.js', [
    "const path = require('node:path');",
    "const { pathToFileURL } = require('node:url');",
    "const base = pathToFileURL(process.cwd() + path.sep).href;",
    'console.log(JSON.stringify({',
    "  version: '2.1.0',",
    '  runs: [{',
    "    tool: { driver: { name: 'Microsoft.CodeAnalysis', rules: [{ id: 'IDE0161' }] } },",
    "    originalUriBaseIds: { SRCROOT: { uri: base } },",
    "    artifacts: [{ location: { uri: 'src/Order%20Handler.cs', uriBaseId: 'SRCROOT' } }],",
    '    results: [{',
    '      ruleIndex: 0,',
    "      message: { text: 'Use a file-scoped namespace.' },",
    '      locations: [{ physicalLocation: { artifactLocation: { index: 0 }, region: { startLine: 7, startColumn: 9 } } }],',
    '    }],',
    '  }],',
    '}));',
    'process.exit(1);',
  ].join('\n'));
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: dotnet.code-quality',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: sarif',
    '    run: "node emit-sarif.js"',
    '    message: ".NET diagnostics must pass."',
  ].join('\n'));
  commitAll(root);

  const result = verify(root, { skipFixtures: true });
  const violation = result.rule_violations.find((entry) => entry.rule === 'dotnet.code-quality');
  assert.ok(violation, result.errors.join('\n'));
  assert.strictEqual(violation.file, 'src/Order Handler.cs');
  assert.strictEqual(violation.line, 7);
  assert.strictEqual(violation.column, 9);
  assert.match(violation.message, /^\[IDE0161\] Use a file-scoped namespace\.$/);
  assert.ok(result.errors.some((error) => error.includes('src/Order Handler.cs:7:9')));
  assert.ok(!result.errors.some((error) => error.includes('did not run cleanly')));
});

test('SARIF adapter fails closed on malformed logs', () => {
  const root = tmpDir();
  write(root, 'bad-sarif.js', "console.log(JSON.stringify({ version: '2.1.0', runs: {} }));\n");
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: dotnet.code-quality',
    '    severity: error',
    '    engine: external',
    '    evidence: [".agentlintel/rules.yaml"]',
    '    adapter: sarif',
    '    run: "node bad-sarif.js"',
    '    message: ".NET diagnostics must pass."',
  ].join('\n'));
  commitAll(root);

  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((error) => error.includes('did not run cleanly')), result.errors.join('\n'));
  assert.ok(result.external_engines.some((engine) => engine.status.includes('SARIF output runs must be an array')));
});

test('dotnet SARIF runner merges compiler logs and normalizes repository paths', () => {
  const root = tmpDir();
  const runner = path.join(__dirname, '..', 'templates', 'engine-adapters', 'dotnet-sarif.js');
  write(root, 'fake-build.js', [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const arg = process.argv.find((value) => value.startsWith('-p:CustomAfterMicrosoftCommonTargets='));",
    "const targets = fs.readFileSync(arg.slice('-p:CustomAfterMicrosoftCommonTargets='.length), 'utf8');",
    "const pattern = targets.match(/<ErrorLog>(.+),version=2\\.1<\\/ErrorLog>/)[1].replace(/&amp;/g, '&');",
    "const report = pattern.replace('$(MSBuildProjectName)', 'Example').replace('$(TargetFramework)', 'net10.0');",
    'fs.writeFileSync(report, JSON.stringify({',
    "  version: '2.1.0',",
    '  runs: [{',
    "    tool: { driver: { name: 'Microsoft.CodeAnalysis' } },",
    '    results: [{',
    "      ruleId: 'CA1852',",
    "      message: { text: 'Seal internal types.' },",
    "      locations: [{ physicalLocation: { artifactLocation: { uri: path.join(process.cwd(), 'src', 'Worker.cs') }, region: { startLine: 3 } } }],",
    '    }],',
    '  }],',
    '}));',
  ].join('\n'));

  const result = spawnSync(process.execPath, [runner, '--', process.execPath, 'fake-build.js'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 1, result.stderr);
  const sarif = JSON.parse(result.stdout);
  assert.strictEqual(sarif.version, '2.1.0');
  assert.strictEqual(sarif.runs.length, 1);
  assert.strictEqual(
    sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,
    'src/Worker.cs',
  );
});
