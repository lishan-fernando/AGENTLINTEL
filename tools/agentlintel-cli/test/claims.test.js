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
  return git.stdout.toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => fs.existsSync(path.join(REPO, rel)));
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
    /\bIt works with Claude Code, Cursor, Codex\b/i,
    /instruction files dropped from the prompt roughly a third/i,
    /61(?:-|\u2013)79% compliance/i,
  ];

  for (const rel of surfaces) {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    for (const pattern of banned) assert.doesNotMatch(text, pattern, `${rel} must not claim ${pattern}`);
  }
});

test('public repository excludes private planning notes and local agent state', () => {
  const files = repoFiles();
  const internalOnlyFiles = [
    '.claude/settings.local.json',
    'docs/LAUNCH-PLAYBOOK.md',
    'docs/PRODUCTION-FEEDBACK.md',
    'docs/COMPETITIVE-POSITIONING.md',
  ];
  for (const rel of internalOnlyFiles) {
    assert.ok(!files.includes(rel), `${rel} must not be tracked in the public repository`);
  }

  for (const rel of files) {
    assert.ok(!rel.startsWith('.claude/'), `${rel} must not expose local agent state`);
  }
});

test('public feedback intake does not solicit private adoption conversations', () => {
  const template = read('.github/ISSUE_TEMPLATE/feedback.yml');
  const readme = read('README.md');
  const contributing = read('CONTRIBUTING.md');

  assert.doesNotMatch(template, /\bpilot\b/i);
  assert.doesNotMatch(template, /\bquote\b|outcome anonymously/i);
  assert.match(template, /public, sanitized details/i);
  assert.match(template, /sensitive adoption context/i);

  for (const [rel, text] of [['README.md', readme], ['CONTRIBUTING.md', contributing]]) {
    assert.doesNotMatch(text, /feedback or pilot issue/i, `${rel} must not route private adoption work to public issues`);
    assert.match(text, /sanitized/i, `${rel} should ask for sanitized public feedback`);
    assert.match(text, /sensitive\s+adoption\s+context/i, `${rel} should keep internal adoption context out of public issues`);
  }
});

test('license posture stays consistent across public surfaces (ADR-020/ADR-021)', () => {
  const license = read('LICENSE');
  const legal = read('docs/LEGAL.md');
  const notice = read('NOTICE');
  const adr020 = read('.agentlintel/decisions/ADR-020-free-use-no-resale-license.md');
  const adr021 = read('.agentlintel/decisions/ADR-021-clarify-adoption-template-license-boundary.md');
  assert.match(license, /^# AgentLintel Free Use No-Resale License, Version 1\.0/);
  assert.match(license, /LicenseRef-AgentLintel-Free-Use-No-Resale-1\.0/);
  assert.match(license, /Prohibited Resale/);
  assert.doesNotMatch(license, /Grant of Future License|effective on the second anniversary|Apache License, Version 2\.0/);
  assert.strictEqual(read('tools/agentlintel-cli/LICENSE'), license, 'CLI package LICENSE must stay byte-identical to the root LICENSE');
  assert.match(read('tools/agentlintel-cli/LICENSE-APACHE'), /Apache License/);
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-APACHE')), 'secondary Apache text must not create a second root license tab');
  assert.ok(!fs.existsSync(path.join(REPO, 'LICENSE-POLICY.md')), 'license boundary map must not create a third root license tab');
  assert.match(legal, /AgentLintel Legal Boundary/);

  const legalBoundaryPatterns = [
    /AgentLintel-supplied adoption templates and examples/,
    /`tools\/agentlintel-cli\/templates\/\*\*`/,
    /this repository's own `\.agentlintel\/\*\*`/,
    /this repository's own `\.github\/\*\*`/,
    /`\.pre-commit-hooks\.yaml`/,
    /not made\s+Apache-2\.0 merely because they live under `\.agentlintel\/`/,
    /Template-derived files remain subject to normal Apache-2\.0 notice\/license\s+preservation/,
  ];
  for (const pattern of legalBoundaryPatterns) {
    assert.match(legal, pattern, `docs/LEGAL.md must preserve clarified adoption boundary ${pattern}`);
  }

  const noticeBoundaryPatterns = [
    /AgentLintel-supplied templates and examples/,
    /tools\/agentlintel-cli\/templates\/\*\*/,
    /this repository's\s+own \.agentlintel\/\*\*/,
    /this repository's\s+own \.github\/\*\*/,
    /\.pre-commit-hooks\.yaml/,
    /not Apache-2\.0 merely because they live under \.agentlintel\//,
  ];
  for (const pattern of noticeBoundaryPatterns) {
    assert.match(notice, pattern, `NOTICE must preserve clarified adoption boundary ${pattern}`);
  }

  assert.match(adr020, /Free-Use No-Resale License/);
  assert.match(adr021, /Clarify Adoption Template License Boundary/);
  assert.match(adr021, /Public docs and claim tests must use "AgentLintel-supplied templates"/);

  assert.strictEqual(require('../../../package.json').license, 'SEE LICENSE IN LICENSE');
  assert.strictEqual(require('../package.json').license, 'SEE LICENSE IN LICENSE');

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md']) {
    assert.doesNotMatch(read(rel), /open[- ]source (framework|project|tool|CLI)/i, `${rel} must not call the no-resale core open source`);
    assert.match(read(rel), /Source-available free use|source-available free use/);
    assert.doesNotMatch(read(rel), /FSL-1\.1-ALv2|Functional Source License|future grant|becomes Apache-2\.0 after two years/i);
  }

  for (const rel of ['README.md', 'tools/agentlintel-cli/README.md', 'docs/LEGAL.md']) {
    assert.match(read(rel), /does\s+(?:\*\*)?not(?:\*\*)?\s+change\s+the\s+license\s+of\s+your\s+source\s+code/i);
    assert.match(read(rel), /generated\s+files,\s+or\s+output|generated\s+files,\s+or other output|generated\s+files,\s+or\s+other\s+output|application-generated\s+files,\s+reports,\s+or\s+output/i);
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
