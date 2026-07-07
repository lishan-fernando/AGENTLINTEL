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

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
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
        if (skipDirs.has(entry.name)) continue;
        if (matchesSkipPrefix(relativePath, skipPrefixes, true)) continue;
        stack.push(relativePath);
        continue;
      }

      if (
        entry.isFile() &&
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
          pattern += ".*";
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
};
