// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fileURLToPath } = require('node:url');

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
const commandLine = separator === -1 ? argv : argv.slice(separator + 1);

if (!commandLine.length || commandLine.some((arg) =>
  /^[-/]p:(?:ErrorLog|CustomAfterMicrosoftCommonTargets)=/i.test(arg),
)) {
  console.error('Usage: node dotnet-sarif.js -- dotnet build <solution-or-project> [options]');
  console.error('Do not pass ErrorLog or CustomAfterMicrosoftCommonTargets; this adapter owns them.');
  process.exitCode = 2;
} else {
  run(commandLine);
}

function run([command, ...args]) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlintel-dotnet-sarif-'));
  const reportPattern = path.join(
    reportDir,
    '$(MSBuildProjectName).$(TargetFramework).sarif',
  );
  const targetsPath = path.join(reportDir, 'agentlintel-sarif.targets');
  let exitCode = 2;

  try {
    fs.writeFileSync(targetsPath, [
      '<Project>',
      '  <PropertyGroup>',
      `    <ErrorLog>${xmlText(reportPattern)},version=2.1</ErrorLog>`,
      '  </PropertyGroup>',
      '</Project>',
      '',
    ].join('\n'));
    const result = spawnSync(
      command,
      [...args, `-p:CustomAfterMicrosoftCommonTargets=${targetsPath}`],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: Number(process.env.AGENTLINTEL_DOTNET_TIMEOUT_MS) || 300000,
      },
    );
    const reports = findReports(reportDir);
    if (result.error || result.status === null || !reports.length) {
      const reason = result.error
        ? String(result.error.message || result.error)
        : result.status === null
          ? 'command timed out'
          : `command exited ${result.status} without producing SARIF`;
      console.error(`dotnet SARIF adapter failed: ${reason}`);
      writeCommandOutput(result);
      exitCode = 2;
      return;
    }

    const merged = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [],
    };
    for (const report of reports) {
      const doc = JSON.parse(fs.readFileSync(report, 'utf8').replace(/^\uFEFF/, ''));
      if (doc.version !== '2.1.0' || !Array.isArray(doc.runs))
        throw new Error(`${path.basename(report)} is not SARIF 2.1.0`);
      for (const sarifRun of doc.runs) {
        normalizeRunLocations(sarifRun, process.cwd());
        merged.runs.push(sarifRun);
      }
    }

    const findings = merged.runs.reduce(
      (count, sarifRun) => count + (Array.isArray(sarifRun.results) ? sarifRun.results.length : 0),
      0,
    );
    process.stdout.write(`${JSON.stringify(merged)}\n`);
    if (findings) exitCode = 1;
    else if (result.status === 0) exitCode = 0;
    else {
      console.error(`dotnet command exited ${result.status} without a SARIF finding`);
      writeCommandOutput(result);
      exitCode = 2;
    }
  } catch (error) {
    console.error(`dotnet SARIF adapter failed: ${error.message || error}`);
    exitCode = 2;
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
    process.exitCode = exitCode;
  }
}

function findReports(root) {
  const reports = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      else if (entry.isFile() && entry.name.endsWith('.sarif')) reports.push(target);
    }
  }
  return reports.sort();
}

function normalizeRunLocations(sarifRun, repoRoot) {
  for (const artifact of sarifRun.artifacts || [])
    normalizeArtifact(artifact && artifact.location, repoRoot);
  for (const result of sarifRun.results || [])
    for (const location of result.locations || [])
      normalizeArtifact(
        location && location.physicalLocation && location.physicalLocation.artifactLocation,
        repoRoot,
      );
}

function normalizeArtifact(artifact, repoRoot) {
  if (!artifact || typeof artifact.uri !== 'string' || !artifact.uri) return;
  let sourcePath = artifact.uri;
  try {
    sourcePath = sourcePath.startsWith('file:')
      ? fileURLToPath(sourcePath)
      : decodeURIComponent(sourcePath);
  } catch {
    return;
  }
  if (!path.isAbsolute(sourcePath)) return;
  const relative = path.relative(repoRoot, sourcePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return;
  artifact.uri = encodeURI(relative.replace(/\\/g, '/'));
  delete artifact.uriBaseId;
}

function writeCommandOutput(result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (output) console.error(output.slice(0, 8000));
}

function xmlText(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
