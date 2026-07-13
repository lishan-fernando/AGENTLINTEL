// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const DEFAULT_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "bin-cache",
  ".venv",
  "venv",
  "target",
  "vendor",
]);
const ROOT_ONLY_SKIP = new Set(["dist", "build", "bin-cache", "target", "vendor"]);

function readYaml(filePath) {
  // Governance is data, not a YAML object graph. Disabling aliases avoids
  // cyclic or exponentially expanded values reaching verification/reporting.
  return YAML.parse(fs.readFileSync(filePath, "utf8"), { maxAliasCount: 0 });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function sameDirectory(left, right) {
  try {
    const leftStat = fs.statSync(left, { bigint: true });
    const rightStat = fs.statSync(right, { bigint: true });
    if (!leftStat.isDirectory() || !rightStat.isDirectory()) return false;
    if ((leftStat.dev !== 0n || leftStat.ino !== 0n) &&
        leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino)
      return true;
  } catch {}

  try {
    return path.relative(fs.realpathSync(left), fs.realpathSync(right)) === "";
  } catch {
    return path.relative(path.resolve(left), path.resolve(right)) === "";
  }
}

function walk(root, { skipDirs = DEFAULT_SKIP, skipPrefixes = [] } = {}) {
  const files = [];
  const stack = [""];

  while (stack.length) {
    const relativeDir = stack.pop();
    const absoluteDir = relativeDir ? path.join(root, relativeDir) : root;
    let entries;

    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) &&
            (!ROOT_ONLY_SKIP.has(entry.name) || relativeDir === "")) continue;
        if (matchesSkipPrefix(relativePath, skipPrefixes, true)) continue;
        stack.push(relativePath);
        continue;
      }

      if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        !matchesSkipPrefix(relativePath, skipPrefixes, false)
      )
        files.push(relativePath);
    }
  }

  return files.sort();
}

function matchesSkipPrefix(relativePath, skipPrefixes, includeExact) {
  return skipPrefixes.some(
    (prefix) =>
      relativePath.startsWith(`${prefix}/`) ||
      (includeExact && relativePath === prefix),
  );
}

function globToRegex(glob) {
  let pattern = "";
  let index = 0;

  while (index < glob.length) {
    const char = glob[index];

    if (char === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          pattern += "(?:[^/]+/)*";
          index += 3;
        } else {
          pattern += "[\\s\\S]*";
          index += 2;
        }
      } else {
        pattern += "[^/]*";
        index += 1;
      }
      continue;
    }

    if (char === "?") {
      pattern += "[^/]";
      index += 1;
      continue;
    }

    pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    index += 1;
  }

  return new RegExp(`^${pattern}$`);
}

const globCache = new Map();

function matchGlob(glob, value) {
  let regex = globCache.get(glob);
  if (!regex) {
    regex = globToRegex(glob);
    globCache.set(glob, regex);
  }
  return regex.test(value);
}

function matchAny(globs, value) {
  return (globs || []).some((glob) => matchGlob(glob, value));
}

module.exports = {
  readYaml,
  readJson,
  walk,
  globToRegex,
  matchGlob,
  matchAny,
  toPosix,
  sameDirectory,
};
