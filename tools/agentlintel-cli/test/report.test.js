// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { renderReport, nextSteps, tableCell } = require('../src/commands/report');

function result(overrides = {}) {
  return {
    root: '/repo',
    ok: false,
    kernel_present: true,
    facts: [],
    rule_violations: [],
    exempted_count: 0,
    legacy_violation_count: 0,
    violation_baseline: {
      status: 'not configured', rules: [], legacy: 0, introduced: 0, resolved: 0,
    },
    fixtures: [],
    guard: { status: 'checked 1 changed file(s)', violations: [] },
    ratchet: { status: 'unchanged', ok: true },
    fact_ratchet: { status: 'unchanged', ok: true },
    exemplar_ratchet: { status: 'unchanged', ok: true },
    guard_ratchet: { status: 'unchanged', ok: true },
    exemplars: [],
    adapters: [],
    errors: [],
    warnings: [],
    ...overrides,
  };
}

test('report renders deterministic next steps for common gate failures', () => {
  const r = result({
    facts: [{ claim: 'Stack uses X', ok: false, detail: 'missing' }],
    rule_violations: [{ rule: 'slice.no-deep-imports', file: 'a.ts', line: 1, message: 'deep import' }],
    guard: { status: 'checked 2 changed file(s)', violations: [{ file: 'other.ts' }] },
    ratchet: { status: 'changed', ok: false },
    fact_ratchet: { status: 'changed', ok: false },
    guard_ratchet: { status: 'changed', ok: false },
    errors: ['FACT [stack] missing', 'RULE [slice.no-deep-imports] a.ts:1 deep import'],
  });
  const markdown = renderReport(r);
  assert.match(markdown, /## Next Steps/);
  assert.match(markdown, /Make stale facts true again/);
  assert.match(markdown, /Fix rule violations in code/);
  assert.match(markdown, /inside `guard\.json` write zones/);
  assert.match(markdown, /Rule weakening requires a new append-only ADR/);
  assert.match(markdown, /Fact weakening requires a new append-only ADR/);
  assert.match(markdown, /Guard ratchet \| changed, ADR required/);
  assert.match(markdown, /Guard weakening requires a new append-only ADR/);
});

test('next steps call out warning-only strict-mode risks', () => {
  const steps = nextSteps(result({
    ok: true,
    warnings: [
      "GUARD-BASE base 'origin/main' could not be resolved",
      'RULE-SCOPE [ghost.rule] matched zero files',
    ],
  }));
  assert.ok(steps.some((s) => s.includes('checkout with enough history')), steps.join('\n'));
  assert.ok(steps.some((s) => s.includes('Fix empty rule scopes')), steps.join('\n'));
  assert.ok(steps.some((s) => s.includes('fail under `--strict`')), steps.join('\n'));
});

test('dormant rules are counted in the Rules row and get a next step', () => {
  const markdown = renderReport(result({
    ok: true,
    dormant_rules: ['domain.purity', 'boundary.validation'],
  }));
  assert.match(markdown, /0 violation\(s\), 2 dormant/);
  assert.match(markdown, /Dormant rules \(`must_match: false`/);
});

test('report does not suggest fixing already exempted rule violations', () => {
  const markdown = renderReport(result({
    ok: true,
    rule_violations: [{ rule: 'legacy.deep-import', exempted: true }],
    exempted_count: 1,
  }));
  assert.match(markdown, /0 violation\(s\) \(\+1 exempted\)/);
  assert.doesNotMatch(markdown, /Fix rule violations in code/);
});

test('report keeps legacy debt visible without presenting it as active failure', () => {
  const markdown = renderReport(result({
    ok: true,
    rule_violations: [{ rule: 'debt.no-bad', legacy: true }],
    legacy_violation_count: 1,
    violation_baseline: {
      status: 'checked against abc123',
      rules: ['debt.no-bad'],
      legacy: 1,
      introduced: 0,
      resolved: 2,
    },
  }));
  assert.match(markdown, /0 violation\(s\) \(\+1 legacy\)/);
  assert.match(markdown, /Violation baseline \| checked against abc123; 1 legacy, 0 introduced, 2 resolved/);
  assert.doesNotMatch(markdown, /Fix rule violations in code/);
});

test('pending facts and table-breaking fact text render clearly', () => {
  const markdown = renderReport(result({
    ok: true,
    facts: [{ claim: 'Uses A | B\nsecond line', ok: false, pending: true, detail: 'needs check | ADR' }],
  }));
  assert.match(markdown, /PENDING - needs check/);
  assert.match(markdown, /Uses A \\\| B<br>second line/);
  assert.match(markdown, /needs check \\\| ADR/);
});

test('skipped command facts are not reported as fresh', () => {
  const markdown = renderReport(result({
    facts: [{ claim: 'Command passes', ok: true, skipped: true, detail: 'skipped (--no-run)' }],
  }));
  assert.match(markdown, /Facts \| 0\/1 fresh/);
  assert.match(markdown, /\| Command passes \| SKIPPED \(--no-run\) \|/);
  assert.doesNotMatch(markdown, /SKIPPED --no-run -/);
  assert.doesNotMatch(markdown, /Command passes \| fresh/);
});

test('tableCell escapes markdown table delimiters and newlines', () => {
  assert.strictEqual(tableCell('a | b\nc'), 'a \\| b<br>c');
});
