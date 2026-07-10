// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readYaml, sameDirectory } = require("./io");

const WORKSPACE_FILE = "agentlintel.workspace.yaml";

function workspacePath(root) {
  const candidate = path.join(root, WORKSPACE_FILE);
  return fs.existsSync(candidate) ? candidate : null;
}

function regularFileInside(root, filePath) {
  try {
    if (!fs.lstatSync(filePath).isFile()) return false;
    let cursor = path.resolve(root);
    const relative = path.relative(cursor, path.resolve(filePath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (fs.lstatSync(cursor).isSymbolicLink()) return false;
    }
    const inside = path.relative(fs.realpathSync(root), fs.realpathSync(filePath));
    return !inside.startsWith("..") && !path.isAbsolute(inside);
  } catch {
    return false;
  }
}

function regularDirectoryInside(root, dirPath) {
  try {
    if (!fs.lstatSync(dirPath).isDirectory()) return false;
    let cursor = path.resolve(root);
    const relative = path.relative(cursor, path.resolve(dirPath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (fs.lstatSync(cursor).isSymbolicLink()) return false;
    }
    const inside = path.relative(fs.realpathSync(root), fs.realpathSync(dirPath));
    return !inside.startsWith("..") && !path.isAbsolute(inside);
  } catch {
    return false;
  }
}

function gitTopLevel(dir) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? path.resolve(result.stdout.trim()) : null;
}

function manifestIsIndexedSymlink(root) {
  const result = spawnSync("git", ["ls-files", "-s", "--", WORKSPACE_FILE], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && /^(?:120000|160000) /.test(result.stdout);
}

function loadWorkspace(root) {
  const manifest = workspacePath(root);
  if (!manifest)
    return { members: [], errors: [`no ${WORKSPACE_FILE} at ${root}`] };

  const members = [];
  const errors = [];
  if (!regularFileInside(root, manifest) || manifestIsIndexedSymlink(root))
    return { members, errors: [`${WORKSPACE_FILE} must be a regular in-workspace file`] };
  let doc;
  try {
    doc = readYaml(manifest);
  } catch (error) {
    return { members, errors: [`invalid ${WORKSPACE_FILE}: ${error.message || error}`] };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) ||
      Object.keys(doc).some((key) => !["members", "$comment"].includes(key)) ||
      !Array.isArray(doc.members))
    return { members, errors: [`${WORKSPACE_FILE} must contain only a members array`] };
  const entries = doc.members;

  if (!entries.length) errors.push(`${WORKSPACE_FILE} declares no members`);
  const seen = new Set();

  for (const entry of entries) {
    const memberPath = entry;
    if (typeof memberPath !== "string" || !memberPath.trim()) {
      errors.push(`member entry ${JSON.stringify(entry)} has no path`);
      continue;
    }
    if (path.isAbsolute(memberPath)) {
      errors.push(`member '${memberPath}' must be relative to the workspace`);
      continue;
    }
    const absolutePath = path.resolve(root, memberPath);
    const relative = path.relative(path.resolve(root), absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push(`member '${memberPath}' escapes the workspace`);
      continue;
    }
    const identity = process.platform === "win32"
      ? absolutePath.toLowerCase()
      : absolutePath;
    if (seen.has(identity)) {
      errors.push(`member '${memberPath}' is duplicated`);
      continue;
    }
    seen.add(identity);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`member '${memberPath}' does not exist`);
      continue;
    }
    if (!regularDirectoryInside(root, absolutePath)) {
      errors.push(`member '${memberPath}' must be a regular directory inside the workspace`);
      continue;
    }

    let realMember;
    try {
      realMember = fs.realpathSync(absolutePath);
    } catch {
      realMember = null;
    }
    const topLevel = realMember ? gitTopLevel(realMember) : null;
    if (!topLevel || !sameDirectory(realMember, topLevel)) {
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
