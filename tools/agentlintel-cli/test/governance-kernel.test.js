// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  verify,
  verifyFacts,
  detectRuleWeakening,
  preparedRuleSet,
  checkGuard,
  checkAdapters,
} = require('../src/lib/verify');
const {
  tmpDir, write, git, REPO,
} = require('./governance-helpers');

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

