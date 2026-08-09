// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

// Repository path safety: symlink and escape guards around every evidence
// read. Root realpaths are memoized per process (they cannot change mid-run);
// evidence files are resolved on every call because their symlink state is
// exactly what is being checked.

const fs = require("node:fs");
const path = require("node:path");

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

const rootRealpathCache = new Map();

function realpathOfRoot(root) {
  const key = path.resolve(root);
  if (!rootRealpathCache.has(key)) {
    try {
      rootRealpathCache.set(key, fs.realpathSync(root));
    } catch {
      rootRealpathCache.set(key, null);
    }
  }
  return rootRealpathCache.get(key);
}

function realPathInside(root, filePath) {
  const rootReal = realpathOfRoot(root);
  if (rootReal == null) return false;
  try {
    const relative = path.relative(rootReal, fs.realpathSync(filePath));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}

function pathHasSymlink(root, filePath) {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
  let cursor = path.resolve(root);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

function safeRepoPathPresent(root, filePath) {
  return !pathHasSymlink(root, filePath) && realPathInside(root, filePath);
}

function safeRepoPath(root, filePath) {
  return pathEntryExists(filePath) && safeRepoPathPresent(root, filePath);
}

function safeRegularRepoFile(root, filePath) {
  try {
    return fs.lstatSync(filePath).isFile() && safeRepoPathPresent(root, filePath);
  } catch {
    return false;
  }
}

function safeRepoDirectory(root, filePath) {
  try {
    return fs.lstatSync(filePath).isDirectory() && safeRepoPathPresent(root, filePath);
  } catch {
    return false;
  }
}

module.exports = {
  pathEntryExists,
  pathHasSymlink,
  realPathInside,
  safeRepoPath,
  safeRegularRepoFile,
  safeRepoDirectory,
};
