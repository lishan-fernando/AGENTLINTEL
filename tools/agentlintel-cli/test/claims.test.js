// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');

function repoFiles() {
  const git = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: REPO, encoding: 'buffer' });
  assert.strictEqual(git.status, 0, git.stderr && git.stderr.toString());
  return git.stdout.toString('utf8').split('\0').filter(Boolean).map((rel) => rel.replace(/\\/g, '/'));
}

function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

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

test('license posture stays consistent across public surfaces (ADR-020)', () => {
  const license = read('LICENSE');
  const legal = read('docs/LEGAL.md');
  assert.match(license, /^# AgentLintel Free Use No-Resale License, Version 1\.0/);
  assert.match(license, /LicenseRef-AgentLintel-Free-Use-No-Resale-1\.0/);
  assert.match(license, /Prohibited Resale/);
  assert.doesNotMatch(license, /Grant of Future License|effective on the second anniversary|Apache License, Version 2\.0/);
  assert.strictEqual(read('tools/agentlintel-cli/LICENSE'), license, 'CLI package LICENSE must stay byte-identical to the root LICENSE');
  assert.match(read('tools/agentlintel-cli/LICENSE-APACHE'), /Apache License/);
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-APACHE')), 'secondary Apache text must not create a second root license tab');
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-POLICY.md')), 'license boundary map must not create a third root license tab');
  assert.match(legal, /AgentLintel Legal Boundary/);
  for (const boundary of ['.agentlintel/**', '.github/**', '.pre-commit-hooks.yaml', 'tools/agentlintel-cli/templates/**']) {
    assert.ok(legal.includes(boundary), `docs/LEGAL.md must name adoption boundary ${boundary}`);
    assert.ok(read('NOTICE').includes(boundary), `NOTICE must name adoption boundary ${boundary}`);
    assert.ok(read('.agentlintel/decisions/ADR-020-free-use-no-resale-license.md').includes(boundary), `ADR-020 must name adoption boundary ${boundary}`);
  }

  assert.strictEqual(require('../../../package.json').license, 'SEE LICENSE IN LICENSE');
  assert.strictEqual(require('../package.json').license, 'SEE LICENSE IN LICENSE');

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md']) {
    assert.doesNotMatch(read(rel), /open[- ]source (framework|project|tool|CLI)/i, `${rel} must not call the no-resale core open source`);
    assert.match(read(rel), /Source-available free use|source-available free use/);
    assert.doesNotMatch(read(rel), /FSL-1\.1-ALv2|Functional Source License|future grant|becomes Apache-2\.0 after two years/i);
  }

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', 'docs/LEGAL.md']) {
    assert.match(read(rel), /does\s+not\s+change\s+the\s+license\s+of\s+your\s+source\s+code/i);
    assert.match(read(rel), /generated\s+files,\s+or\s+output|generated\s+files,\s+or other output|generated\s+files,\s+or\s+other\s+output/i);
  }
  assert.match(legal, /grant\s+AgentLintel\s+rights\s+to\s+your\s+project/i);
  assert.match(legal, /do not sell AgentLintel itself/i);
  assert.match(legal, /There is no automatic Apache-2\.0\s+conversion/i);
});

test('file license headers match the legal boundary', () => {
  const isAdoption = (rel) =>
    rel.startsWith('.agentlintel/') ||
    rel.startsWith('.github/') ||
    rel === '.pre-commit-hooks.yaml' ||
    rel.startsWith('tools/agentlintel-cli/templates/');
  const isCoreJs = (rel) =>
    rel.endsWith('.js') &&
    (
      rel === 'tools/agentlintel-cli/bin/agentlintel.js' ||
      rel.startsWith('tools/agentlintel-cli/src/') ||
      rel.startsWith('tools/agentlintel-cli/test/')
    );

  for (const rel of repoFiles()) {
    const header = read(rel).split(/\r?\n/).slice(0, 5).join('\n');
    const spdx = (header.match(/SPDX-License-Identifier:\s*([^\r\n]+)/) || [])[1];

    if (isCoreJs(rel)) {
      assert.strictEqual(spdx, 'LicenseRef-AgentLintel-Free-Use-No-Resale-1.0', `${rel} must carry the core SPDX header`);
    }
    if (isAdoption(rel) && spdx) {
      assert.strictEqual(spdx, 'Apache-2.0', `${rel} is adoption surface and must not carry the core SPDX header`);
    }
  }
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
