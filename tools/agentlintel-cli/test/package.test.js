// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..', '..');
const PKG = require('../package.json');
const NPM_UNPACKED_BYTE_BUDGET = 102552;

let packCache = null;

// LF-normalized byte count; CRLF checkouts must not move the budget (see budget.test.js).
function normalizedSize(abs) {
  const buf = fs.readFileSync(abs);
  let crlf = 0;
  for (let i = 1; i < buf.length; i++) {
    if (buf[i] === 10 && buf[i - 1] === 13) crlf++;
  }
  return buf.length - crlf;
}

function quoteCmd(value) {
  const s = String(value);
  if (!/[\s"&|<>^]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec, ['/d', '/s', '/c', `npm ${args.map(quoteCmd).join(' ')}`], { cwd, encoding: 'utf8' });
  }
  return spawnSync('npm', args, { cwd, encoding: 'utf8' });
}

function runNode(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

function parsePack(stdout) {
  const text = String(stdout || '').trim();
  const start = text.indexOf('[');
  assert.notStrictEqual(start, -1, `npm pack did not emit JSON: ${stdout}`);
  return JSON.parse(text.slice(start))[0];
}

function packedCli() {
  if (packCache) return packCache;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-pack-'));
  const packDir = path.join(tmp, 'pack');
  fs.mkdirSync(packDir);
  const packed = runNpm(['pack', '--pack-destination', packDir, '--json'], ROOT);
  assert.strictEqual(packed.status, 0, packed.stderr || packed.stdout);
  const meta = parsePack(packed.stdout);
  const files = new Set(meta.files.map((f) => f.path.replace(/\\/g, '/')));
  const byPath = new Map(meta.files.map((f) => [f.path.replace(/\\/g, '/'), f]));
  packCache = { tmp, meta, files, byPath, tarball: path.join(packDir, meta.filename) };
  return packCache;
}

after(() => {
  if (packCache) fs.rmSync(packCache.tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

test('npm package contains runtime files and excludes tests', () => {
  const { meta, files, byPath } = packedCli();

  for (const required of [
    'bin/agentlintel.js',
    'src/lib/verify.js',
    'src/commands/init.js',
    'src/commands/report.js',
    'src/commands/migrate.js',
    'src/lib/workspace.js',
    'templates/AGENTS.template.md',
    'templates/conformance/CONFORMANCE.md',
    'templates/skills/mirror-exemplar/SKILL.md',
    'templates/hooks/verify-hook.sh',
    'README.md',
    'package.json',
    'LICENSE',
  ]) {
    assert.ok(files.has(required), `package is missing ${required}`);
  }

  assert.ok(![...files].some((f) => f.startsWith('test/')), 'tests should not ship in the runtime package');
  // npm's unpackedSize stats the checkout, so CRLF working trees inflate it;
  // measure the packed file list normalized to LF for an OS-stable number.
  const unpacked = meta.files.reduce((sum, f) => sum + normalizedSize(path.join(ROOT, f.path)), 0);
  assert.ok(unpacked <= NPM_UNPACKED_BYTE_BUDGET, `unpacked package bytes ${unpacked} exceed budget ${NPM_UNPACKED_BYTE_BUDGET}`);
  if (process.platform === 'win32') {
    const git = spawnSync('git', ['ls-files', '--stage', 'tools/agentlintel-cli/bin/agentlintel.js'], { cwd: REPO, encoding: 'utf8' });
    assert.strictEqual(git.status, 0, git.stderr);
    assert.match(git.stdout, /^100755 /, 'CLI bin should be executable in the Git index');
  } else {
    assert.strictEqual(byPath.get('bin/agentlintel.js').mode, 493, 'CLI bin should pack as executable 0755');
  }
});

test('packaged README contains install, quick start, and CI anchors', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, new RegExp(`releases/download/v${PKG.version.replace(/\./g, '\\.')}/agentlintel-cli\\.tgz`));
  assert.match(readme, /npm i -D @agentlintel\/cli/);
  assert.match(readme, /npx agentlintel init/);
  assert.match(readme, /npx agentlintel verify/);
  assert.match(readme, /lishan-fernando\/AGENTLINTEL\/\.github\/actions\/agentlintel@v2/);
});

test('packed tarball installs and boots the adopter quick start', () => {
  const { tarball, tmp } = packedCli();
  const appDir = path.join(tmp, 'app');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'package.json'), '{"name":"agentlintel-smoke","version":"1.0.0","private":true,"type":"commonjs"}\n');

  const install = runNpm(['install', '--no-audit', '--no-fund', '--package-lock=false', tarball], appDir);
  assert.strictEqual(install.status, 0, install.stderr || install.stdout);

  const bin = path.join(appDir, 'node_modules', '@agentlintel', 'cli', 'bin', 'agentlintel.js');
  const help = runNode([bin, 'help'], appDir);
  assert.strictEqual(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /agentlintel init/);

  const init = runNode([bin, 'init'], appDir);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  assert.match(init.stdout, /write \.agentlintel\/rules.yaml/);

  const verify = runNode([bin, 'verify'], appDir);
  assert.strictEqual(verify.status, 0, verify.stderr || verify.stdout);
  assert.match(verify.stdout, /GATE PASSED/);

  const report = runNode([bin, 'report', '--json'], appDir);
  assert.strictEqual(report.status, 0, report.stderr || report.stdout);
  assert.strictEqual(JSON.parse(report.stdout).ok, true);
});
