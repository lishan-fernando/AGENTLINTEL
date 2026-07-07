// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
// LAW test: every rule in the kernel has fixtures and they are green.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { readYaml } = require('../src/lib/io');
const { runFixtures } = require('../src/lib/verify');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

test('all kernel rules have green conformance fixtures', () => {
  const rulesDoc = readYaml(path.join(REPO_ROOT, '.agentlintel', 'rules.yaml'));
  for (const rule of rulesDoc.rules) {
    assert.strictEqual(
      fs.existsSync(path.join(REPO_ROOT, '.agentlintel', 'conformance', rule.id, 'README.md')),
      false,
      `${rule.id} should rely on fixture cases, not per-rule README prose`,
    );
  }
  const results = runFixtures(REPO_ROOT, rulesDoc);
  assert.ok(results.length >= rulesDoc.rules.length, 'every rule should produce at least one fixture result');
  const failures = results.filter((r) => !r.ok);
  assert.deepStrictEqual(
    failures.map((f) => `${f.rule}/${f.case}: ${f.detail}`),
    [],
    'all fixtures must be green',
  );
});
