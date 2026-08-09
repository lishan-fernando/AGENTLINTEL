// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

// Git state queries: one focused home for every subprocess against the
// repository. Two cost disciplines live here:
//   - the inventory probe is consolidated (5 spawns -> 3 per run) and the
//     tracked set is derived from the flag listing instead of a re-query;
//   - baseline blobs are memoized per verify run, because ref:path content
//     cannot change while a run is in flight. A mid-run mutation (e.g. a
//     command fact committing) is already caught by the state fingerprint
//     and fails closed. verify() clears the cache on entry.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { walk, sameDirectory } = require("./io");
const { pathEntryExists } = require("./safe-paths");

const MAX_SCAN_BYTES = 2097152;
const ALWAYS_SKIPPED_SEGMENTS = new Set([".git", "node_modules", ".venv", "venv"]);
// Written as a code point so the escape never depends on source encoding.
const REPLACEMENT_CHAR = String.fromCodePoint(0xfffd);

function validRef(ref) {
  return typeof ref === "string" && ref.length > 0 && !ref.startsWith("-") && !ref.includes("\0");
}

function gitOutput(root, args) {
  const spawned = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 67108864,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return spawned.status === 0 && !spawned.stdout.includes(REPLACEMENT_CHAR)
    ? spawned.stdout
    : null;
}

function gitStateFingerprint(root) {
  const probes = [
    ["rev-parse", "--verify", "HEAD"],
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    ["ls-files", "-v", "-z"],
    ["ls-files", "--stage", "-z"],
    ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-renames", "HEAD", "--"],
  ];
  const hash = crypto.createHash("sha256");
  for (const args of probes) {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 67108864,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return null;
    hash.update(result.stdout);
    hash.update("\0");
  }
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 67108864,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (untracked.status !== 0) return null;
  const names = untracked.stdout.toString("utf8");
  if (names.includes(REPLACEMENT_CHAR)) return null;
  let untrackedBytes = 0;
  const buffer = Buffer.allocUnsafe(65536);
  for (const relPath of names.split("\0").filter(Boolean)) {
    const absolutePath = path.join(root, relPath);
    let before;
    try {
      before = fs.lstatSync(absolutePath);
      hash.update(relPath);
      hash.update(`\0${before.mode}\0${before.size}\0`);
      if (before.isSymbolicLink()) {
        hash.update(fs.readlinkSync(absolutePath));
      } else if (before.isFile()) {
        untrackedBytes += before.size;
        if (untrackedBytes > 67108864) return null;
        const descriptor = fs.openSync(absolutePath, "r");
        try {
          let count;
          while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0)
            hash.update(buffer.subarray(0, count));
        } finally {
          fs.closeSync(descriptor);
        }
      } else {
        return null;
      }
      const after = fs.lstatSync(absolutePath);
      if (after.mode !== before.mode || after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs) return null;
    } catch {
      return null;
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function resolveCommitBase(root, base) {
  if (!base) return { commit: null, error: null };
  if (!validRef(base))
    return { commit: null, error: `comparison base '${base}' is unsafe` };

  const commitOutput = gitOutput(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${base}^{commit}`,
  ]);
  if (commitOutput != null) {
    const commit = commitOutput.trim();
    return /^[0-9a-f]{40,64}$/i.test(commit)
      ? { commit, error: null }
      : { commit: null, error: `comparison base '${base}' returned an invalid commit id` };
  }

  const objectOutput = gitOutput(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${base}^{object}`,
  ]);
  return objectOutput == null
    ? { commit: null, error: null }
    : { commit: null, error: `comparison base '${base}' must resolve to a commit` };
}

function parseStatusZ(output) {
  const files = [];
  const entries = String(output || "")
    .split("\0")
    .filter(Boolean);

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const statusCode = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (filePath) files.push(filePath);
    // Renames and copies carry the source path as the next NUL-separated entry.
    if (/[RC]/.test(statusCode) && entries[index + 1])
      files.push(entries[++index]);
  }

  return files;
}

function changedFiles(root, base) {
  const result = { files: null, note: "", baseResolved: !base };
  const statusOutput = gitOutput(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (statusOutput == null)
    return { files: null, note: "no git", baseResolved: false };

  const fileSets = [parseStatusZ(statusOutput)];

  if (base) {
    if (!validRef(base))
      return { files: null, note: `unsafe base ref '${base}'`, baseResolved: false };

    const output = gitOutput(root, [
      "diff",
      "--relative",
      "--name-only",
      "--no-renames",
      "-z",
      "--end-of-options",
      base,
      "HEAD",
    ]);
    if (output != null) {
      fileSets.push(
        output
          .split("\0")
          .filter(Boolean),
      );
      result.note = `base ${base}`;
      result.baseResolved = true;
    } else {
      result.note = `base '${base}' unavailable - checked working tree only`;
    }
  }

  result.files = [
    ...new Set(
      fileSets
        .flat()
        .filter(Boolean),
    ),
  ];
  return result;
}

function resolveBase(base) {
  return (
    base ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null)
  );
}

const blobCache = new Map();

function clearGitStateCaches() {
  blobCache.clear();
}

function gitBlob(root, ref, filePath) {
  if (!validRef(ref)) return { status: "error", error: "unsafe baseline ref" };
  const key = `${path.resolve(root)}\0${ref}\0${filePath}`;
  if (blobCache.has(key)) return blobCache.get(key);
  const spec = `${ref}:${filePath}`;
  const sizeOutput = gitOutput(root, ["cat-file", "-s", spec]);
  const result = blobResult(root, spec, sizeOutput);
  blobCache.set(key, result);
  return result;
}

function blobResult(root, spec, sizeOutput) {
  if (sizeOutput == null) return { status: "absent" };
  const size = Number(sizeOutput.trim());
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SCAN_BYTES)
    return { status: "error", error: `baseline blob is invalid or exceeds ${MAX_SCAN_BYTES} bytes` };
  const spawned = spawnSync("git", ["show", "--end-of-options", spec], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_SCAN_BYTES + 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return spawned.status === 0
    ? { status: "read", content: spawned.stdout }
    : { status: "error", error: "baseline blob could not be read" };
}

function trackedNonRegularFiles(root) {
  const output = gitOutput(root, ["ls-files", "-s", "-z"]);
  if (output == null) return [];
  return output
    .split("\0")
    .filter((entry) => /^(?:120000|160000) /.test(entry) && entry.includes("\t"))
    .map((entry) => ({
      mode: entry.slice(0, 6),
      file: entry.slice(entry.indexOf("\t") + 1),
    }))
    .filter((entry) => pathEntryExists(path.join(root, entry.file)));
}

function repositoryInventory(root) {
  // One probe answers both questions: work-tree membership and top-level.
  const probe = gitOutput(root, ["rev-parse", "--is-inside-work-tree", "--show-toplevel"]);
  const probeLines = probe == null ? [] : probe.split("\n").map((line) => line.trim());
  if (probeLines[0] !== "true")
    return {
      files: walk(root, { skipDirs: ALWAYS_SKIPPED_SEGMENTS }),
      error: null,
      source: "filesystem",
      tracked: null,
    };
  const topLevel = probeLines[1] || "";
  if (!topLevel)
    return { files: [], error: "INVENTORY Git top-level could not be read", source: "git" };
  if (!sameDirectory(root, topLevel))
    return {
      files: [],
      error: `INVENTORY verification root must be the Git top-level: ${topLevel}`,
      source: "git",
    };
  const flags = gitOutput(root, ["ls-files", "-v", "-z"]);
  if (flags == null)
    return { files: [], error: "INVENTORY Git index flags could not be read", source: "git" };
  const cached = flags.split("\0").filter(Boolean);
  const sparse = cached.filter((entry) => entry.startsWith("S "));
  if (sparse.length)
    return {
      files: [],
      error: `INVENTORY sparse checkout omits ${sparse.length} tracked path(s); full verification requires a complete checkout`,
      source: "git",
    };
  const hidden = cached.filter((entry) => /^[a-z] /.test(entry));
  if (hidden.length)
    return {
      files: [],
      error: `INVENTORY ${hidden.length} tracked path(s) use assume-unchanged index flags`,
      source: "git",
    };
  const output = gitOutput(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  if (output == null)
    return { files: [], error: "INVENTORY Git file inventory failed", source: "git" };
  return {
    files: [...new Set(output.split("\0").filter(Boolean))]
      .filter((file) => pathEntryExists(path.join(root, file)))
      .sort(),
    error: null,
    source: "git",
    // The -v listing is the cached set; a separate ls-files --cached would
    // re-query identical state.
    tracked: new Set(cached.map((entry) => entry.slice(2))),
  };
}

function baselineAvailable(root, ref) {
  if (!validRef(ref)) return false;
  return gitOutput(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]) != null;
}

module.exports = {
  MAX_SCAN_BYTES,
  ALWAYS_SKIPPED_SEGMENTS,
  validRef,
  gitOutput,
  gitStateFingerprint,
  resolveCommitBase,
  changedFiles,
  resolveBase,
  gitBlob,
  clearGitStateCaches,
  trackedNonRegularFiles,
  repositoryInventory,
  baselineAvailable,
};
