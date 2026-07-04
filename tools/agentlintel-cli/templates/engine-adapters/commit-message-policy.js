// SPDX-License-Identifier: Apache-2.0
'use strict';

const { spawnSync } = require('node:child_process');

const pattern = new RegExp(
  process.env.AGENTLINTEL_COMMIT_PATTERN || '^(feat|fix|docs|test|refactor|chore|ci|build|perf)(\\([^)]+\\))?!?: .+',
);

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function commitSubjects() {
  if (process.env.AGENTLINTEL_COMMIT_MESSAGE) return [process.env.AGENTLINTEL_COMMIT_MESSAGE];
  const range = process.env.AGENTLINTEL_COMMIT_RANGE ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}...HEAD` : '');
  const subjects = range ? git(['log', '--format=%s', range]).split(/\r?\n/).filter(Boolean) : [];
  return subjects.length ? subjects : [git(['log', '-1', '--format=%s'])].filter(Boolean);
}

const bad = commitSubjects().filter((subject) => !pattern.test(subject));
if (bad.length) {
  console.error(`Commit subject does not match AGENTLINTEL_COMMIT_PATTERN: ${bad[0]}`);
  process.exit(1);
}
