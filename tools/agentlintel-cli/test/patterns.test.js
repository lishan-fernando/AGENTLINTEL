// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
// Tests for the layers engine and architecture pattern packs.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runRule } = require('../src/lib/engines');
const { verify } = require('../src/lib/verify');
const { init } = require('../src/commands/init');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-'));
}
function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const THREE_TIER = {
  id: 'arch.layers',
  severity: 'error',
  engine: 'layers',
  applies_to: ['**/*.ts', '**/*.tsx', '**/*.py', '**/*.cs', '**/*.go', '**/*.java', '**/*.kt', '**/*.swift'],
  layers: [
    { name: 'presentation', path: ['src/ui/**'] },
    { name: 'business', path: ['src/services/**'] },
    { name: 'data', path: ['src/data/**'] },
  ],
  allowed: { presentation: ['business'], business: ['data'], data: [] },
  aliases: { '@/': 'src/' },
  message: '3-tier.',
};

test('layers: allowed downward dependency passes, skipping fails, upward fails', () => {
  assert.deepStrictEqual(runRule(THREE_TIER, 'src/ui/page.ts', "import { s } from '../services/svc';"), []);
  const skip = runRule(THREE_TIER, 'src/ui/page.ts', "import { db } from '../data/db';");
  assert.strictEqual(skip.length, 1);
  assert.match(skip[0].message, /'presentation' must not depend on layer 'data'/);
  const up = runRule(THREE_TIER, 'src/data/db.ts', "import { s } from '../services/svc';");
  assert.strictEqual(up.length, 1);
  assert.match(up[0].message, /'data' must not depend on layer 'business'/);
});

test('layers: same layer, out-of-layer files, and package imports are ignored', () => {
  assert.deepStrictEqual(runRule(THREE_TIER, 'src/ui/page.ts', "import { x } from './widget';"), []);
  assert.deepStrictEqual(runRule(THREE_TIER, 'scripts/build.ts', "import { db } from '../src/data/db';"), []);
  assert.deepStrictEqual(runRule(THREE_TIER, 'src/ui/page.ts', "import { z } from 'zod';"), []);
});

test('layers: aliases and bare root-relative specifiers resolve into layers', () => {
  const viaAlias = runRule(THREE_TIER, 'src/ui/page.ts', "import { db } from '@/data/db';");
  assert.strictEqual(viaAlias.length, 1);
  const bare = runRule(THREE_TIER, 'src/ui/page.ts', "const db = require('src/data/db');");
  assert.strictEqual(bare.length, 1);
});

test('layers: python relative and dotted imports resolve', () => {
  const rel = runRule(THREE_TIER, 'src/ui/page.py', 'from ..data.db import query');
  assert.strictEqual(rel.length, 1);
  assert.match(rel[0].message, /'presentation' must not depend on layer 'data'/);
  const dotted = runRule(THREE_TIER, 'src/ui/page.py', 'import src.data.db');
  assert.strictEqual(dotted.length, 1);
  assert.deepStrictEqual(runRule(THREE_TIER, 'src/ui/page.py', 'import os'), []);
});

test('layers: native namespace imports resolve for C#, Java, Kotlin, Swift, and Go', () => {
  for (const [file, src] of [
    ['src/ui/Page.cs', 'using src.data;'],
    ['src/ui/Page.java', 'import src.data.OrderRepo;'],
    ['src/ui/Page.kt', 'import src.data.OrderRepo'],
    ['src/ui/Page.swift', 'import src.data'],
    ['src/ui/page.go', 'import (\n  "src/data"\n)'],
  ]) {
    const v = runRule(THREE_TIER, file, src);
    assert.strictEqual(v.length, 1, `${file} should catch a data-layer import`);
    assert.match(v[0].message, /'presentation' must not depend on layer 'data'/);
  }
});

test('init --pattern layered-3tier and mvvm are green out of the box, then catch violations', () => {
  for (const [pattern, badFile, badImport] of [
    ['layered-3tier', 'src/presentation/page.ts', "import { r } from '../data/repo';"],
    ['mvvm', 'src/views/View.tsx', "import { m } from '../models/model';"],
  ]) {
    const root = tmpDir();
    const r = init(root, { pattern });
    assert.strictEqual(r.ok, true, r.log.join('\n'));
    const clean = verify(root, {});
    assert.deepStrictEqual(clean.errors, [], `${pattern}: ${clean.errors.join('\n')}`);
    assert.ok(clean.fixtures.some((f) => f.rule === 'arch.layers' && f.ok), `${pattern} ships arch.layers fixtures`);
    write(root, badFile, badImport);
    const dirty = verify(root, { skipFixtures: true });
    assert.ok(dirty.errors.some((e) => e.includes('arch.layers')), `${pattern} catches the violation: ${dirty.errors.join('\n')}`);
  }
});

test('init --pattern custom is green and documents the layers skeleton', () => {
  const root = tmpDir();
  const r = init(root, { pattern: 'custom' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(verify(root, {}).errors, []);
  const rules = fs.readFileSync(path.join(root, '.agentlintel', 'rules.yaml'), 'utf8');
  assert.match(rules, /engine: layers/, 'skeleton shows the layers engine');
});

test('pattern packs do not generate vertical-slice-only AGENTS instructions', () => {
  const root = tmpDir();
  init(root, { pattern: 'mvvm' });
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /selected\s+pattern/i);
  assert.doesNotMatch(agents, /A slice is one business capability/);
  assert.doesNotMatch(agents, /Result<T, E>/);
});

test('init rejects an unknown pattern with the available list', () => {
  const r = init(tmpDir(), { pattern: 'three-tier' });
  assert.strictEqual(r.ok, false);
  assert.match(r.log[0], /vertical-slice/);
  assert.match(r.log[0], /layered-3tier/);
});

test('layers: multi-line (Prettier-style) imports are caught', () => {
  const v = runRule(THREE_TIER, 'src/ui/page.ts', [
    'import {',
    '  orderRepo,',
    '  otherThing,',
    "} from '../data/orderRepo';",
  ].join('\n'));
  assert.strictEqual(v.length, 1, 'multi-line import must not evade the gate');
  assert.match(v[0].message, /'presentation' must not depend on layer 'data'/);
});

test('layers: barrel imports and python from-package imports classify into the layer', () => {
  const barrel = runRule(THREE_TIER, 'src/ui/page.ts', "import { repo } from '../data';");
  assert.strictEqual(barrel.length, 1, "'../data' resolves to the data layer root");
  const pyFrom = runRule(THREE_TIER, 'src/ui/page.py', 'from src.data import repo');
  assert.strictEqual(pyFrom.length, 1, "'from src.data import repo' lands in the data layer");
});

test('layers: alias resolution is longest-prefix and misconfig fails loud', () => {
  const rule = { ...THREE_TIER, aliases: { '@': 'src/data/', '@ui/': 'src/ui/' } };
  const v = runRule(rule, 'src/ui/page.ts', "import { w } from '@ui/widget';");
  assert.deepStrictEqual(v, [], "'@ui/' must win over '@' - same-layer import");

  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: arch.layers',
    '    severity: error',
    '    engine: layers',
    '    layers:',
    '      - { name: ui, path: ["src/ui/**"] }',
    '      - { name: broken, path: [] }',
    '    allowed: { ui: [typo-layer] }',
    '    message: m',
  ].join('\n'));
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('RULE-CONFIG') && e.includes('typo-layer')), result.errors.join('\n'));
  assert.ok(result.errors.some((e) => e.includes('RULE-CONFIG') && e.includes("'broken' has no path globs")));
});

test('a directory merely named conformance/ is NOT a gate bypass', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: no-boom',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: no boom',
  ].join('\n'));
  write(root, 'src/conformance/sneaky.ts', 'const x = "boom";');
  const result = verify(root, { skipFixtures: true });
  assert.ok(result.errors.some((e) => e.includes('src/conformance/sneaky.ts')), 'non-kernel conformance dirs are scanned');
});

test('orphaned fixture directories are surfaced', () => {
  const root = tmpDir();
  init(root, {});
  const rules = path.join(root, '.agentlintel', 'rules.yaml');
  fs.writeFileSync(rules, fs.readFileSync(rules, 'utf8').replace(/  - id: domain\.purity[\s\S]*?(?=  - id: identity)/, ''));
  const result = verify(root, {});
  assert.ok(result.warnings.some((w) => w.includes('ORPHAN-FIXTURE [domain.purity]')), result.warnings.join('\n'));
});

test('re-running init with a different pattern does not silently pretend to switch', () => {
  const root = tmpDir();
  init(root, { pattern: 'layered-3tier' });
  const second = init(root, { pattern: 'mvvm' });
  assert.ok(second.log.some((l) => l.includes("pattern 'mvvm' NOT applied")), second.log.join('\n'));
  const rules = fs.readFileSync(path.join(root, '.agentlintel', 'rules.yaml'), 'utf8');
  assert.match(rules, /3-tier/, 'original pattern rules are untouched');
  assert.deepStrictEqual(verify(root, {}).errors, [], 'no stranded fixtures from the refused pattern');
});

test('refused pattern does not copy mismatched fixtures beside existing rules', () => {
  const root = tmpDir();
  write(root, '.agentlintel/rules.yaml', [
    'version: 2',
    'rules:',
    '  - id: existing.rule',
    '    severity: error',
    '    engine: regex',
    '    applies_to: ["src/**/*.ts"]',
    '    forbidden: ["boom"]',
    '    message: existing',
  ].join('\n'));
  const r = init(root, { pattern: 'mvvm' });
  assert.ok(r.log.some((l) => l.includes("pattern 'mvvm' NOT applied")), r.log.join('\n'));
  assert.ok(!fs.existsSync(path.join(root, '.agentlintel', 'conformance', 'arch.layers')), 'mvvm fixtures were not stranded');
  const result = verify(root, {});
  assert.ok(result.errors.some((e) => e.includes('LAW VIOLATION') && e.includes('existing.rule')), result.errors.join('\n'));
});

test('universal rules are byte-equal across the base template and every pattern pack', () => {
  const YAML = require('yaml');
  const tpl = path.join(__dirname, '..', 'templates');
  const docs = [path.join(tpl, 'rules.template.yaml')];
  for (const p of fs.readdirSync(path.join(tpl, 'patterns'))) docs.push(path.join(tpl, 'patterns', p, 'rules.yaml'));
  const reference = {};
  for (const file of docs) {
    const rules = YAML.parse(fs.readFileSync(file, 'utf8')).rules || [];
    for (const id of ['secrets.no-logging', 'exemption.audited']) {
      const rule = rules.find((r) => r.id === id);
      assert.ok(rule, `${file} ships ${id}`);
      if (!reference[id]) reference[id] = { rule, from: file };
      else assert.deepStrictEqual(rule, reference[id].rule, `${id} drifted between ${reference[id].from} and ${file}`);
    }
  }
});
