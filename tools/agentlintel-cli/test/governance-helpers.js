// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

// Shared hermetic-repo helpers for the governance suites. Requiring this
// module also strips GITHUB_BASE_REF: on pull_request events the engine's
// resolveBase falls back to origin/$GITHUB_BASE_REF (a feature for adopter
// CI), but these temp repos have no origin - the leaked ref degrades the
// ratchet to a warning.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

delete process.env.GITHUB_BASE_REF;

const REPO = path.join(__dirname, '..', '..', '..');

const NO_NEW_RULES = [
  'version: 2',
  'rules:',
  '  - id: debt.no-bad',
  '    severity: error',
  '    engine: regex',
  '    enforcement: no-new',
  '    applies_to: ["src/**/*.ts"]',
  '    must_match: true',
  '    forbidden: ["BAD"]',
  '    message: "BAD is forbidden"',
].join('\n');

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

function noNewRepo() {
  const root = tmpDir();
  git(root, 'init -q');
  git(root, 'config user.email t@t.t');
  git(root, 'config user.name t');
  write(root, '.agentlintel/rules.yaml', NO_NEW_RULES);
  write(root, 'src/legacy.ts', 'BAD\n');
  git(root, 'add -A');
  git(root, 'commit -q -m baseline');
  return { root, base: git(root, 'rev-parse HEAD').trim() };
}

module.exports = {
  REPO,
  NO_NEW_RULES,
  RATCHET_BASE_RULES,
  tmpDir,
  write,
  git,
  noNewRepo,
};
