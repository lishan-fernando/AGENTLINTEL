// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');

test('public adoption surfaces avoid unearned market claims', () => {
  const surfaces = [
    'README.md',
    'tools/agentlintel-cli/README.md',
    'docs/PUBLISHING.md',
    'package.json',
    'tools/agentlintel-cli/package.json',
    '.github/actions/agentlintel/action.yml',
    '.pre-commit-hooks.yaml',
  ];
  const banned = [
    /\bindustry standard\b/i,
    /\bproven causal impact\b/i,
    /\bproven across\b/i,
    /\breplaces static analysis\b/i,
    /\bfully automatic governance\b/i,
    /\bworks for every stack\b/i,
    /\bguaranteed to prevent architecture drift\b/i,
    /\bstable by law\b|\beverything `?init`? scaffolds into your repo\b/i,
  ];

  for (const rel of surfaces) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    for (const pattern of banned) assert.doesNotMatch(text, pattern, `${rel} must not claim ${pattern}`);
  }
});

test('license posture stays consistent across public surfaces (ADR-012)', () => {
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

  const license = read('LICENSE');
  assert.match(license, /^# Functional Source License, Version 1\.1, ALv2 Future License/);
  assert.strictEqual(read('tools/agentlintel-cli/LICENSE'), license, 'CLI package LICENSE must stay byte-identical to the root LICENSE');
  assert.match(read('tools/agentlintel-cli/LICENSE-APACHE'), /Apache License/);
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-APACHE')), 'secondary Apache text must not create a second root license tab');
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-POLICY.md')), 'license boundary map must not create a third root license tab');
  assert.match(read('docs/LEGAL.md'), /AgentLintel Legal Boundary/);

  assert.strictEqual(require('../../../package.json').license, 'FSL-1.1-ALv2');
  assert.strictEqual(require('../package.json').license, 'FSL-1.1-ALv2');

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md']) {
    assert.doesNotMatch(read(rel), /open[- ]source (framework|project|tool|CLI)/i, `${rel} must not call the core open source; it is fair source (FSL-1.1-ALv2) until each release's Apache-2.0 grant matures`);
  }

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', 'docs/LEGAL.md']) assert.match(read(rel), /does not change the license of your\s+source\s+code/i);
  assert.match(read('docs/LEGAL.md'), /grant AgentLintel rights to your project/i);
  assert.match(read('docs/LEGAL.md'), /future grant applies to\s+AgentLintel releases,\s+not your project/i);
});

test('public adoption surfaces use one canonical repository coordinate', () => {
  const surfaces = [
    'README.md',
    'tools/agentlintel-cli/README.md',
    'docs/PUBLISHING.md',
    'package.json',
    'tools/agentlintel-cli/package.json',
    '.github/actions/agentlintel/action.yml',
    '.pre-commit-hooks.yaml',
  ];
  for (const rel of surfaces) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    assert.doesNotMatch(text, /github\.com\/agentlintel\/agentlintel/i, `${rel} has stale repo coordinates`);
  }
});
