// SPDX-License-Identifier: FSL-1.1-ALv2
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
    fixtures: [],
    guard: { status: 'checked 1 changed file(s)', violations: [] },
    ratchet: { status: 'unchanged', ok: true },
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
    errors: ['FACT [stack] missing', 'RULE [slice.no-deep-imports] a.ts:1 deep import'],
  });
  const markdown = renderReport(r);
  assert.match(markdown, /## Next Steps/);
  assert.match(markdown, /Refresh stale facts/);
  assert.match(markdown, /Fix rule violations in code/);
  assert.match(markdown, /inside `guard\.json` write zones/);
  assert.match(markdown, /Rule weakening requires an append-only ADR/);
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

test('pending facts and table-breaking fact text render clearly', () => {
  const markdown = renderReport(result({
    ok: true,
    facts: [{ claim: 'Uses A | B\nsecond line', ok: false, pending: true, detail: 'needs check | ADR' }],
  }));
  assert.match(markdown, /PENDING - needs check/);
  assert.match(markdown, /Uses A \\\| B<br>second line/);
  assert.match(markdown, /needs check \\\| ADR/);
});

test('tableCell escapes markdown table delimiters and newlines', () => {
  assert.strictEqual(tableCell('a | b\nc'), 'a \\| b<br>c');
});
