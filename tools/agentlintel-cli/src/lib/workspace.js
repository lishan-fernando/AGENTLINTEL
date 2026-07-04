// SPDX-License-Identifier: FSL-1.1-ALv2
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readYaml } = require("./io");

const WORKSPACE_FILE = "agentlintel.workspace.yaml";

function workspacePath(root) {
  const candidate = path.join(root, WORKSPACE_FILE);
  return fs.existsSync(candidate) ? candidate : null;
}

function loadWorkspace(root) {
  const manifest = workspacePath(root);
  if (!manifest)
    return { members: [], errors: [`no ${WORKSPACE_FILE} at ${root}`] };

  const members = [];
  const errors = [];
  const entries = (readYaml(manifest) || {}).members || [];

  if (!entries.length) errors.push(`${WORKSPACE_FILE} declares no members`);

  for (const entry of entries) {
    const memberPath = typeof entry === "string" ? entry : entry && entry.path;
    if (typeof memberPath !== "string" || !memberPath.trim()) {
      errors.push(`member entry ${JSON.stringify(entry)} has no path`);
      continue;
    }

    const absolutePath = path.isAbsolute(memberPath)
      ? memberPath
      : path.join(root, memberPath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`member '${memberPath}' does not exist`);
      continue;
    }

    if (!fs.existsSync(path.join(absolutePath, ".git"))) {
      errors.push(
        `member '${memberPath}' is not a git repository (governance must live in git)`,
      );
      continue;
    }

    if (!fs.existsSync(path.join(absolutePath, ".agentlintel"))) {
      errors.push(
        `member '${memberPath}' has no .agentlintel kernel - run: agentlintel init --dir ${memberPath}`,
      );
      continue;
    }

    members.push({ path: memberPath, abs: absolutePath });
  }

  return { members, errors };
}

module.exports = {
  loadWorkspace,
  workspacePath,
  WORKSPACE_FILE,
};
