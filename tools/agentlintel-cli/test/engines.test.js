// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runRule } = require('../src/lib/engines');

const exemptionRule = {
  id: 'exemption.audited',
  severity: 'error',
  engine: 'exemptions',
  marker: 'AGENTLINTEL-EXEMPT',
  required_fields: ['Reason', 'Approver', 'Expires', 'Owner'],
  within_lines: 5,
  excludes: ['**/*.md'],
  message: 'Exemptions must declare Reason, Approver, Expires, Owner.',
};

test('exemption with all fields and future expiry passes', () => {
  const src = [
    '// AGENTLINTEL-EXEMPT: domain.purity',
    '// Reason: legacy SDK',
    '// Approver: arch@example.com',
    '// Expires: 2099-01-01',
    '// Owner: team@example.com',
  ].join('\n');
  assert.deepStrictEqual(runRule(exemptionRule, 'a.ts', src), []);
});

test('exemption missing Approver fails', () => {
  const src = ['// AGENTLINTEL-EXEMPT: x', '// Reason: r', '// Expires: 2099-01-01', '// Owner: o'].join('\n');
  const v = runRule(exemptionRule, 'a.ts', src);
  assert.strictEqual(v.length, 1);
  assert.match(v[0].message, /Approver/);
});

test('expired exemption fails even when complete', () => {
  const src = [
    '// AGENTLINTEL-EXEMPT: x',
    '// Reason: r',
    '// Approver: a',
    '// Expires: 2020-01-01',
    '// Owner: o',
  ].join('\n');
  const v = runRule(exemptionRule, 'a.ts', src);
  assert.strictEqual(v.length, 1);
  assert.match(v[0].message, /expired/i);
});

test('markdown files are excluded from exemption scan', () => {
  const v = runRule(exemptionRule, 'docs/SPEC.md', 'AGENTLINTEL-EXEMPT example with no fields');
  assert.deepStrictEqual(v, []);
});

const errorCodeRule = {
  id: 'error-code.format',
  severity: 'error',
  engine: 'error-codes',
  applies_to: ['**/contract/errors.*'],
  categories: ['VAL', 'AUTH', 'STATE', 'UNKNOWN'],
  message: 'Error codes follow <SLICE>-<CATEGORY>-<NUMBER>.',
};

test('error-code engine flags bad category and lowercase slice', () => {
  const src = "export const E = { a: 'CAP-FOO-001', b: 'cap-VAL-001', c: 'CAP-VAL-001' }";
  const v = runRule(errorCodeRule, 'slices/Cap/contract/errors.ts', src);
  assert.strictEqual(v.length, 2);
});

test('error-code engine ignores files outside applies_to', () => {
  const v = runRule(errorCodeRule, 'src/dates.ts', "const d = 'not-a-CODE-123'");
  assert.deepStrictEqual(v, []);
});
