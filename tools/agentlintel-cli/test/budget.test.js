// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
// Frozen lean cap from the alpha.5 public baseline (then ~25% below the
// pre-lean size). Re-baselined for the ADR-016 explain/warn/hook DX surface,
// ADR-018 alpha.9 hygiene, ADR-019 CI/npm release contract, ADR-020 license
// clarity text, ADR-021 adoption-template license-boundary clarity,
// ADR-022 verifier-integrity checks, ADR-023's decision-grade benchmark
// evidence, ADR-024/025 positive evidence, and ADR-026/027 exact authority,
// protected evidence, compact context, and token-bounded skills, then ADR-028's
// Git-derived violation ratchet and verifier-boundary extraction, and ADR-029's
// verifier throughput and token-efficiency program, plus ADR-030's SARIF
// adapter, .NET starter, fixtures, tests, and adoption guidance.
// The cap includes committed ADRs and CODEOWNERS.
const TRACKED_BYTE_BUDGET = 761000;
// Recalibrated for readable shipped CLI source with meaningful identifiers
// (ADR-014), then for explain/warn/hook DX surface (ADR-016), measured on the
// committed tree; re-baselined for ADR-020/021 legal clarity, ADR-022's
// verifier-integrity checks, ADR-023's empirical report and protocol, and the
// ADR-024/025 positive evidence and ADR-026/027 trust-boundary release.
// ADR-028 adds the no-new gate while keeping less than one percent headroom;
// ADR-029 rebaselines to the measured safe-paths extraction, and ADR-030 adds
// the SARIF/native-analyzer bridge.
const ELIGIBLE_TRACKED_BYTE_BUDGET = 435000;
const DEAD_WEIGHT_EXCLUDE = /^(?:\.agentlintel\/decisions\/|LICENSE$|NOTICE$|docs\/LEGAL\.md$|tools\/agentlintel-cli\/LICENSE(?:-APACHE)?$|tools\/agentlintel-cli\/package-lock\.json$|tools\/agentlintel-cli\/test\/|\.agentlintel\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/conformance\/.*\/cases\/|tools\/agentlintel-cli\/templates\/engine-adapters\/conformance-snippets\/.*\/cases\/)/;

function versionableFiles() {
  const git = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'buffer' });
  assert.strictEqual(git.status, 0, git.stderr && git.stderr.toString());
  return [...new Set(git.stdout.toString('utf8').split('\0').filter(Boolean))];
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

test('versionable repository bytes stay under the frozen lean-baseline cap', () => {
  const total = byteTotal(versionableFiles());
  assert.ok(total <= TRACKED_BYTE_BUDGET, `versionable bytes ${total} exceed budget ${TRACKED_BYTE_BUDGET}`);
});

test('eligible movable payload stays within the ADR-011 byte budget', () => {
  const files = versionableFiles().filter((rel) => !DEAD_WEIGHT_EXCLUDE.test(rel));
  const total = byteTotal(files);
  assert.ok(total <= ELIGIBLE_TRACKED_BYTE_BUDGET, `eligible tracked bytes ${total} exceed budget ${ELIGIBLE_TRACKED_BYTE_BUDGET}`);
});
