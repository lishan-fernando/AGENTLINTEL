// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runRule, requiredRegexViolations, collectExemptionSpans } = require('../src/lib/engines');

test('regex file matching catches a forbidden multi-line structure', () => {
  const rule = {
    id: 'state.pending-guard',
    severity: 'error',
    engine: 'regex',
    match: 'file',
    forbidden: ['CancellationPending[\\s\\S]{0,80}SetCancelledStatus'],
    message: 'Pending cancellation must wait for refund success.',
  };
  const source = ['public void Handle()', '{', '  if (CancellationPending)', '    SetCancelledStatus();', '}'].join('\n');
  const violations = runRule(rule, 'Order.cs', source);
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].line, 3);
});

test('regex required evidence is aggregated across the effective rule scope', () => {
  const rule = {
    id: 'feature.read-surfaces',
    severity: 'error',
    engine: 'regex',
    match: 'file',
    required: ['CancellationReason', 'CancellationRequestedAt'],
    message: 'Expose cancellation metadata.',
  };
  const violations = requiredRegexViolations(rule, [
    { filePath: 'Queries/Order.cs', content: 'public string CancellationReason { get; init; }' },
    { filePath: 'Queries/OrderSummary.cs', content: 'public int Id { get; init; }' },
  ]);
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].file, 'Queries/Order.cs');
  assert.match(violations[0].message, /CancellationRequestedAt/);
});

test('regex required evidence can activate only after a feature trigger appears', () => {
  const rule = {
    id: 'feature.read-surfaces',
    severity: 'error',
    engine: 'regex',
    when: ['CancellationPending'],
    required: ['CancellationReason'],
    message: 'Expose cancellation metadata.',
  };
  const baseline = [{ filePath: 'Order.cs', content: 'public int Id { get; init; }' }];
  assert.deepStrictEqual(requiredRegexViolations(rule, baseline), []);

  const feature = [{ filePath: 'Order.cs', content: 'CancellationPending' }];
  const violations = requiredRegexViolations(rule, feature);
  assert.strictEqual(violations.length, 1);
  assert.match(violations[0].message, /CancellationReason/);
});

test('regex line matching remains the default', () => {
  const rule = {
    id: 'line.compatibility',
    severity: 'error',
    engine: 'regex',
    forbidden: ['first\\s+second'],
    message: 'Default matching must stay line-scoped.',
  };
  assert.deepStrictEqual(runRule(rule, 'a.cs', 'first\nsecond'), []);
});

const exemptionRule = {
  id: 'exemption.audited',
  severity: 'error',
  engine: 'exemptions',
  marker: 'AGENTLINTEL-EXEMPT',
  required_fields: ['Reason', 'Approver', 'Expires', 'Owner', 'Decision'],
  within_lines: 5,
  excludes: ['**/*.md'],
  message: 'Exemptions must declare Reason, Approver, Expires, Owner, Decision.',
};

test('exemption with all fields and future expiry passes', () => {
  const src = [
    '// AGENTLINTEL-EXEMPT: domain.purity',
    '// Reason: legacy SDK',
    '// Approver: arch@example.com',
    '// Expires: 2099-01-01',
    '// Owner: team@example.com',
    '// Decision: ADR-9',
  ].join('\n');
  assert.deepStrictEqual(runRule(exemptionRule, 'a.ts', src), []);
});

test('exemption missing Approver fails', () => {
  const src = ['// AGENTLINTEL-EXEMPT: x', '// Reason: r', '// Expires: 2099-01-01', '// Owner: o', '// Decision: ADR-9'].join('\n');
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
    '// Decision: ADR-9',
  ].join('\n');
  const v = runRule(exemptionRule, 'a.ts', src);
  assert.strictEqual(v.length, 1);
  assert.match(v[0].message, /expired/i);
});

test('empty exemption fields and impossible dates fail', () => {
  const empty = runRule(exemptionRule, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: x',
    '// Reason:',
    '// Approver:',
    '// Expires: 2099-01-01',
    '// Owner:',
    '// Decision: ADR-9',
  ].join('\n'));
  assert.ok(
    empty.some((violation) => violation.message.startsWith('Exemption missing required field(s): Reason, Approver, Owner.')),
    empty.map((v) => v.message).join('\n'),
  );
  assert.deepStrictEqual(collectExemptionSpans(exemptionRule, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: x',
    '// Reason:',
    '// Approver:',
    '// Expires: 2099-01-01',
    '// Owner:',
    '// Decision: ADR-9',
    'forbiddenCall()',
  ].join('\n')), []);

  const invalidDate = runRule(exemptionRule, 'a.ts', [
    '// AGENTLINTEL-EXEMPT: x',
    '// Reason: r',
    '// Approver: a',
    '// Expires: 2099-02-30',
    '// Owner: o',
    '// Decision: ADR-9',
  ].join('\n'));
  assert.ok(invalidDate.some((violation) => /invalid expiry date/.test(violation.message)), invalidDate.map((v) => v.message).join('\n'));
});

test('prefixed marker or field names never authorize suppression', () => {
  const prefixedFields = [
    '// AGENTLINTEL-EXEMPT: x',
    '// Not-Reason: r',
    '// Not-Approver: a',
    '// Not-Expires: 2099-01-01',
    '// Not-Owner: o',
    '// Decision: ADR-9',
  ].join('\n');
  const violations = runRule(exemptionRule, 'a.ts', prefixedFields);
  assert.ok(violations.some((violation) => violation.message.startsWith('Exemption missing required field(s):')));
  assert.deepStrictEqual(collectExemptionSpans(exemptionRule, 'a.ts', prefixedFields), []);

  const prefixedMarker = prefixedFields.replace('AGENTLINTEL-EXEMPT:', 'NOT-AGENTLINTEL-EXEMPT:');
  assert.deepStrictEqual(runRule(exemptionRule, 'a.ts', prefixedMarker), []);
  assert.deepStrictEqual(collectExemptionSpans(exemptionRule, 'a.ts', prefixedMarker), []);
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
