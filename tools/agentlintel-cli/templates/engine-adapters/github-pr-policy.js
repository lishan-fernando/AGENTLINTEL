// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) process.exit(0);

const pr = JSON.parse(fs.readFileSync(eventPath, 'utf8')).pull_request;
if (!pr) process.exit(0);

const pattern = new RegExp(process.env.AGENTLINTEL_PR_TITLE_PATTERN || '^(feat|fix|docs|test|refactor|chore|ci|build|perf)(\\([^)]+\\))?!?: .+');
const maxFiles = Number(process.env.AGENTLINTEL_PR_MAX_CHANGED_FILES || 50), maxDelta = Number(process.env.AGENTLINTEL_PR_MAX_DELTA || 1200), delta = (pr.additions || 0) + (pr.deletions || 0), failures = [];
if (!pattern.test(pr.title || '')) failures.push(`PR title does not match AGENTLINTEL_PR_TITLE_PATTERN: ${pr.title || '(empty)'}`);
if (process.env.AGENTLINTEL_PR_BODY_REQUIRED !== 'false' && !(pr.body || '').trim()) failures.push('PR description is required');
if ((pr.changed_files || 0) > maxFiles) failures.push(`PR changes ${pr.changed_files} files; max is ${maxFiles}`);
if (delta > maxDelta) failures.push(`PR changes ${delta} lines; max is ${maxDelta}`);
if (failures.length) console.error(failures.join('\n')), process.exit(1);
