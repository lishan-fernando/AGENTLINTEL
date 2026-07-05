// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const TRACKED_BYTE_BUDGET = 381754;
// Recalibrated for readable shipped CLI source with meaningful identifiers
// (ADR-014, was 174000 per ADR-013), measured on the committed tree; next
// change needs an ADR.
const ELIGIBLE_TRACKED_BYTE_BUDGET = 214000;
const DEAD_WEIGHT_EXCLUDE = /^(?:\.agentlintel\/decisions\/|LICENSE(?:-APACHE)?$|LICENSE-POLICY\.md$|NOTICE$|tools\/agentlintel-cli\/LICENSE$|tools\/agentlintel-cli\/package-lock\.json$|tools\/agentlintel-cli\/test\/|\.agentlintel\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/engine-adapters\/conformance-snippets\/.*\/cases\/)/;

function trackedFiles() {
  const git = spawnSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'buffer' });
  assert.strictEqual(git.status, 0, git.stderr && git.stderr.toString());
  return git.stdout.toString('utf8').split('\0').filter(Boolean);
}

// Budgets measure normalized (LF) content so the number is identical on
// every checkout; Windows runners materialize text files with CRLF.
function normalizedSize(abs) {
  const buf = fs.readFileSync(abs);
  let crlf = 0;
  for (let i = 1; i < buf.length; i++) {
    if (buf[i] === 10 && buf[i - 1] === 13) crlf++;
  }
  return buf.length - crlf;
}

function byteTotal(files) {
  const total = files.reduce((sum, rel) => {
    const abs = path.join(REPO, rel);
    return fs.existsSync(abs) ? sum + normalizedSize(abs) : sum;
  }, 0);
  return total;
}

test('tracked repository bytes stay at least 25 percent below the baseline', () => {
  const total = byteTotal(trackedFiles());
  assert.ok(total <= TRACKED_BYTE_BUDGET, `tracked bytes ${total} exceed budget ${TRACKED_BYTE_BUDGET}`);
});

test('eligible movable payload stays within the ADR-011 byte budget', () => {
  const files = trackedFiles().filter((rel) => !DEAD_WEIGHT_EXCLUDE.test(rel));
  const total = byteTotal(files);
  assert.ok(total <= ELIGIBLE_TRACKED_BYTE_BUDGET, `eligible tracked bytes ${total} exceed budget ${ELIGIBLE_TRACKED_BYTE_BUDGET}`);
});
