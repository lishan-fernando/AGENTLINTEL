// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { matchGlob } = require('../src/lib/io');

test('** matches nested and root files', () => {
  assert.ok(matchGlob('**/*', 'a/b/c.ts'));
  assert.ok(matchGlob('**/*', 'c.ts'));
});

test('**/domain/** scopes to domain folders at any depth', () => {
  assert.ok(matchGlob('**/domain/**', 'slices/X/domain/rules.ts'));
  assert.ok(matchGlob('**/domain/**', 'domain/rules.ts'));
  assert.ok(!matchGlob('**/domain/**', 'slices/X/application/rules.ts'));
});

test('test-file excludes', () => {
  assert.ok(matchGlob('**/*.test.*', 'slices/Auth/tests/login.test.ts'));
  assert.ok(!matchGlob('**/*.test.*', 'slices/Auth/application/login.ts'));
});

test('zone globs', () => {
  assert.ok(matchGlob('slices/Auth/**', 'slices/Auth/application/login.ts'));
  assert.ok(!matchGlob('slices/Auth/**', 'slices/Capability/application/listItems.ts'));
  assert.ok(matchGlob('slices/*/interface/**', 'slices/Capability/interface/http/handler.ts'));
});
