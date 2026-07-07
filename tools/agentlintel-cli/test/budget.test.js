// SPDX-License-Identifier: FSL-1.1-ALv2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
// Frozen lean cap from the alpha.5 public baseline (then ~25% below the
// pre-lean size). Re-baselined for the ADR-016 explain/warn/hook DX surface,
// then ADR-018 alpha.9 hygiene and ADR-019 CI/npm release contract.
const TRACKED_BYTE_BUDGET = 407000;
// Recalibrated for readable shipped CLI source with meaningful identifiers
// (ADR-014), then for explain/warn/hook DX surface (ADR-016), measured on the
// committed tree; next change needs an ADR.
const ELIGIBLE_TRACKED_BYTE_BUDGET = 230000;
const DEAD_WEIGHT_EXCLUDE = /^(?:\.agentlintel\/decisions\/|LICENSE$|NOTICE$|docs\/LEGAL\.md$|tools\/agentlintel-cli\/LICENSE(?:-APACHE)?$|tools\/agentlintel-cli\/package-lock\.json$|tools\/agentlintel-cli\/test\/|\.agentlintel\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/engine-adapters\/conformance-snippets\/.*\/cases\/)/;

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

test('tracked repository bytes stay under the frozen lean-baseline cap', () => {
  const total = byteTotal(trackedFiles());
  assert.ok(total <= TRACKED_BYTE_BUDGET, `tracked bytes ${total} exceed budget ${TRACKED_BYTE_BUDGET}`);
});

test('eligible movable payload stays within the ADR-011 byte budget', () => {
  const files = trackedFiles().filter((rel) => !DEAD_WEIGHT_EXCLUDE.test(rel));
  const total = byteTotal(files);
  assert.ok(total <= ELIGIBLE_TRACKED_BYTE_BUDGET, `eligible tracked bytes ${total} exceed budget ${ELIGIBLE_TRACKED_BYTE_BUDGET}`);
});
