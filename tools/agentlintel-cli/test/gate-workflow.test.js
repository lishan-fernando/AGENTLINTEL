// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest } = require('../src/lib/strict-gate');

const BIN = path.join(__dirname, '..', 'bin', 'agentlintel.js');
const REPO = path.join(__dirname, '..', '..', '..');
const TEST_RUNTIME = path.join(REPO, '.agentlintel', 'runtime');

function write(root, rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function git(root, args, expected = 0) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, expected,
    `git ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function run(root, args) {
  return spawnSync(process.execPath, [BIN, ...args, '--dir', root], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}

function createRepository({ failingFinal = false } = {}) {
  fs.mkdirSync(TEST_RUNTIME, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEST_RUNTIME, 'gate-journey-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'gate@example.invalid']);
  git(root, ['config', 'user.name', 'Strict Gate Test']);
  write(root, '.gitignore', '.agentlintel/runtime/\nbuild/\n');
  write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  write(root, 'AUTHORIZATION.md', 'Approved strict gate\n');
  write(root, 'proofs/source.txt', 'source proof v1\n');
  write(root, 'src/value.txt', 'base\n');
  const compile = `node -e "const fs=require('fs');fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/artifact.txt','ok')"`;
  const final = failingFinal
    ? 'node -e "process.exit(7)"'
    : 'node -e "setTimeout(() => process.exit(0), 250)"';
  const exclusive = (value) =>
    `node -e "const fs=require('fs');fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/exclusive','${value}',{flag:'wx'});setTimeout(()=>{fs.unlinkSync('build/exclusive');process.exit(0)},250)"`;
  const config = {
    version: 1,
    sourceRef: 'refs/heads/candidate',
    targetRef: 'refs/heads/main',
    workers: 2,
    heartbeatMs: 100,
    tools: [{ id: 'node', run: 'node --version' }],
    packages: ['package-lock.json'],
    authorization: ['AUTHORIZATION.md'],
    sourceProofs: ['proofs/**'],
    commands: [
      {
        id: 'release-build-a',
        stage: 'release-build',
        project: 'ProjectA',
        case: 'project-a-build',
        rule: 'architecture.contract',
        run: compile,
        cleanCheckout: true,
        cache: {
          category: 'release-build',
          inputs: ['src/**', 'package-lock.json'],
          outputs: ['build'],
        },
      },
      {
        id: 'release-build-b',
        stage: 'release-build',
        project: 'ProjectB',
        case: 'project-b-build',
        rule: 'architecture.contract',
        run: compile,
        cleanCheckout: true,
        cache: {
          category: 'release-build',
          inputs: ['src/**', 'package-lock.json'],
          outputs: ['build'],
        },
      },
      {
        id: 'parallel-a',
        stage: 'parallel-checks',
        project: 'ProjectA',
        case: 'isolated-worker-a',
        run: exclusive('a'),
      },
      {
        id: 'parallel-b',
        stage: 'parallel-checks',
        project: 'ProjectB',
        case: 'isolated-worker-b',
        run: exclusive('b'),
      },
      {
        id: 'final-strict-gate',
        stage: 'strict-gate',
        project: 'all',
        case: 'production-equivalence',
        rule: 'production.equivalence',
        run: final,
        final: true,
      },
    ],
  };
  write(root, 'gate.json', `${JSON.stringify(config, null, 2)}\n`);
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'base']);
  git(root, ['checkout', '-q', '-b', 'candidate']);
  write(root, 'src/value.txt', 'candidate\n');
  git(root, ['add', 'src/value.txt']);
  git(root, ['commit', '-q', '-m', 'candidate']);
  return root;
}

function cleanup(root) {
  if (!root || !fs.existsSync(root)) return;
  spawnSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' });
  fs.rmSync(root, { recursive: true, force: true });
}

test('prepare -> verify -> atomic apply binds evidence, deduplicates, caches, and heartbeats', async (t) => {
  const root = createRepository();
  t.after(() => cleanup(root));
  const plan = '.agentlintel/runtime/test-plan.json';
  const bundle = '.agentlintel/runtime/test-bundle.json';

  const prepared = run(root, [
    'gate', 'prepare', '--config', 'gate.json', '--output', plan, '--json',
  ]);
  assert.strictEqual(prepared.status, 0, prepared.stderr);
  const preparedJson = JSON.parse(prepared.stdout);
  assert.strictEqual(preparedJson.plan.binding.heads.targetRef, 'refs/heads/main');
  assert.match(preparedJson.plan.binding.toolDigest, /^[0-9a-f]{64}$/);
  assert.match(preparedJson.plan.binding.packageProof.digest, /^[0-9a-f]{64}$/);
  assert.match(preparedJson.plan.binding.authorizationProof.digest, /^[0-9a-f]{64}$/);
  assert.match(preparedJson.plan.binding.sourceProof.digest, /^[0-9a-f]{64}$/);
  assert.deepStrictEqual(preparedJson.plan.executionGraph.summary, {
    declaredCommands: 5,
    executedCommands: 4,
    deduplicatedCommands: 1,
    requiredCleanCheckouts: 1,
  });
  assert.deepStrictEqual(preparedJson.plan.executionGraph.operationCounts['release-build'], {
    declared: 2,
    executed: 1,
    deduplicated: 1,
  });
  assert.deepStrictEqual(
    preparedJson.plan.executionGraph.stages.map((stage) => stage.dependsOn),
    [[], ['release-build'], ['parallel-checks']],
  );
  assert.deepStrictEqual(
    preparedJson.plan.executionGraph.repeatedOperations[0].commands,
    ['release-build-a', 'release-build-b'],
  );

  const tamperedPlan = structuredClone(preparedJson.plan);
  tamperedPlan.executionGraph.summary.executedCommands = 1;
  const { digest: ignoredDigest, ...tamperedCore } = tamperedPlan;
  tamperedPlan.digest = digest(tamperedCore);
  const tamperedPath = '.agentlintel/runtime/tampered-plan.json';
  write(root, tamperedPath, `${JSON.stringify(tamperedPlan, null, 2)}\n`);
  const tampered = run(root, [
    'gate', 'verify', '--config', 'gate.json', '--plan', tamperedPath,
  ]);
  assert.strictEqual(tampered.status, 2);
  assert.match(tampered.stderr, /execution graph is stale/);

  const verified = run(root, [
    'gate', 'verify', '--config', 'gate.json', '--plan', plan,
    '--output', bundle, '--workers', '1', '--heartbeat-ms', '100', '--json',
  ]);
  assert.strictEqual(verified.status, 0, verified.stderr);
  const verifiedJson = JSON.parse(verified.stdout);
  assert.strictEqual(verifiedJson.ok, true);
  assert.strictEqual(verifiedJson.bundle.strictGate.execution.workers, 1);
  assert.strictEqual(verifiedJson.results.length, 5);
  assert.strictEqual(
    verifiedJson.results.filter((result) => result.cacheStatus === 'deduplicated').length,
    1,
  );
  assert.strictEqual(
    verifiedJson.results.find((result) => result.final).cacheStatus,
    'bypass',
  );
  assert.ok(verifiedJson.timing.slowestCommands.length >= 2);
  assert.ok(verifiedJson.timing.slowestRules.some((item) =>
    item.rule === 'production.equivalence'));
  const progress = verified.stderr.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.ok(progress.some((event) => event.status === 'heartbeat'));
  assert.ok(progress.every((event) =>
    event.stage && event.case && event.total && event.currentProject &&
    Number.isInteger(event.elapsedMs) && event.pid && event.cacheStatus));

  const warmed = run(root, [
    'gate', 'verify', '--config', 'gate.json', '--plan', plan,
    '--output', '.agentlintel/runtime/warm-bundle.json', '--json',
  ]);
  assert.strictEqual(warmed.status, 0, warmed.stderr);
  const warmedJson = JSON.parse(warmed.stdout);
  assert.strictEqual(warmedJson.results[0].cacheStatus, 'hit');
  assert.strictEqual(warmedJson.results.find((result) => result.final).cacheStatus, 'bypass');
  assert.strictEqual(warmedJson.bundle.strictGate.execution.workers, 2);
  assert.ok(warmedJson.results.filter((result) => result.id.startsWith('parallel-'))
    .every((result) => result.workspaceMode === 'parallel-isolated'));

  const mainBefore = git(root, ['rev-parse', 'refs/heads/main']);
  const candidate = git(root, ['rev-parse', 'refs/heads/candidate']);
  const applied = run(root, [
    'gate', 'apply', '--config', 'gate.json', '--bundle', bundle, '--json',
  ]);
  assert.strictEqual(applied.status, 0, applied.stderr);
  const appliedJson = JSON.parse(applied.stdout);
  assert.strictEqual(appliedJson.receipt.previousHead, mainBefore);
  assert.strictEqual(appliedJson.receipt.appliedHead, candidate);
  assert.ok(appliedJson.receipt.elapsedMs < 60000);
  assert.strictEqual(git(root, ['rev-parse', 'refs/heads/main']), candidate);

  const worktrees = git(root, ['worktree', 'list', '--porcelain']);
  assert.doesNotMatch(worktrees, /case-/);
});

test('changed config invalidates a verified bundle without moving the target', (t) => {
  const root = createRepository();
  t.after(() => cleanup(root));
  const plan = '.agentlintel/runtime/stale-plan.json';
  const bundle = '.agentlintel/runtime/stale-bundle.json';
  assert.strictEqual(run(root, [
    'gate', 'prepare', '--config', 'gate.json', '--output', plan,
  ]).status, 0);
  const verified = run(root, [
    'gate', 'verify', '--config', 'gate.json', '--plan', plan, '--output', bundle,
  ]);
  assert.strictEqual(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  const targetBefore = git(root, ['rev-parse', 'refs/heads/main']);
  fs.appendFileSync(path.join(root, 'gate.json'), '\n');
  const applied = run(root, [
    'gate', 'apply', '--config', 'gate.json', '--bundle', bundle,
  ]);
  assert.strictEqual(applied.status, 2);
  assert.match(applied.stderr, /stale/);
  assert.strictEqual(git(root, ['rev-parse', 'refs/heads/main']), targetBefore);
});

test('a failed final strict gate never creates a verification bundle', (t) => {
  const root = createRepository({ failingFinal: true });
  t.after(() => cleanup(root));
  const plan = '.agentlintel/runtime/fail-plan.json';
  const bundle = '.agentlintel/runtime/must-not-exist.json';
  assert.strictEqual(run(root, [
    'gate', 'prepare', '--config', 'gate.json', '--output', plan,
  ]).status, 0);
  const verified = run(root, [
    'gate', 'verify', '--config', 'gate.json', '--plan', plan, '--output', bundle,
  ]);
  assert.strictEqual(verified.status, 1, verified.stderr);
  assert.strictEqual(fs.existsSync(path.join(root, bundle)), false);
  assert.match(verified.stdout, /strict gate failed/);
});
