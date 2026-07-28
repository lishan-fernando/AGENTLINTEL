// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const { spawnSync } = require("node:child_process");
const { parseRenameMap } = require("./violation-ratchet");

const BATCH_BYTES = 32 * 1024 * 1024;

function validRef(ref) {
  return typeof ref === "string" && ref.length > 0 &&
    !ref.startsWith("-") && !ref.includes("\0");
}

function gitText(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 67108864,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && !result.stdout.includes("\uFFFD")
    ? result.stdout
    : null;
}

function blobBatches(blobs) {
  const batches = [];
  let batch = [];
  let bytes = 0;
  for (const blob of blobs) {
    if (batch.length && bytes + blob.size > BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(blob);
    bytes += blob.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function lineEnd(buffer, offset) {
  return buffer.indexOf(10, offset);
}

function readBlobBatch(root, batch) {
  const expectedBytes = batch.reduce((sum, blob) => sum + blob.size + 128, 1024);
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: batch.map((blob) => blob.object).join("\n") + "\n",
    encoding: null,
    maxBuffer: expectedBytes,
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout))
    return { entries: [], error: "Git blob batch could not be read" };

  const entries = [];
  let offset = 0;
  for (const blob of batch) {
    const end = lineEnd(result.stdout, offset);
    if (end === -1)
      return { entries: [], error: `Git blob header is missing for ${blob.filePath}` };
    const header = result.stdout.subarray(offset, end).toString("ascii").split(" ");
    const size = Number(header[2]);
    if (header[0] !== blob.object || header[1] !== "blob" || size !== blob.size)
      return { entries: [], error: `Git blob header is invalid for ${blob.filePath}` };
    const start = end + 1;
    const after = start + size;
    if (after >= result.stdout.length || result.stdout[after] !== 10)
      return { entries: [], error: `Git blob content is truncated for ${blob.filePath}` };
    entries.push({
      filePath: blob.filePath,
      content: result.stdout.subarray(start, after).toString("utf8"),
    });
    offset = after + 1;
  }
  if (offset !== result.stdout.length)
    return { entries: [], error: "Git blob batch returned trailing data" };
  return { entries, error: null };
}

function readBaselineRuleEntries(root, ref, rules, options) {
  if (!validRef(ref))
    return { entries: [], errors: ["unsafe violation baseline ref"] };
  const output = gitText(root, [
    "ls-tree",
    "-r",
    "-z",
    "-l",
    "--full-tree",
    "--end-of-options",
    ref,
  ]);
  if (output == null)
    return { entries: [], errors: [`Git tree at '${ref}' could not be read`] };

  const blobs = [];
  const errors = [];
  for (const record of output.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    if (tab === -1) {
      errors.push("Git tree returned an invalid entry");
      continue;
    }
    const [mode, type, object, sizeText] = record.slice(0, tab).trim().split(/\s+/);
    const filePath = record.slice(tab + 1);
    if (options.isSkipped(filePath)) continue;
    const applicable = rules.some((rule) => options.scansFile(rule, filePath));
    const opaque = rules.some((rule) =>
      options.governsNonRegular(rule, filePath, mode, "directory"));
    if (!applicable && !opaque) continue;
    const size = Number(sizeText);
    if (type !== "blob" || !["100644", "100755"].includes(mode)) {
      errors.push(`${filePath} is Git mode ${mode}, not a regular baseline file`);
      continue;
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > options.maxBytes) {
      errors.push(`${filePath} is invalid or exceeds ${options.maxBytes} bytes`);
      continue;
    }
    blobs.push({ filePath, object, size });
  }

  const entries = [];
  for (const batch of blobBatches(blobs)) {
    const read = readBlobBatch(root, batch);
    if (read.error) errors.push(read.error);
    else entries.push(...read.entries);
  }
  return { entries, errors };
}

function renameMapFromBase(root, base) {
  if (!validRef(base)) return { renames: new Map(), error: "unsafe base ref" };
  const output = gitText(root, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--end-of-options",
    base,
    "--",
  ]);
  return output == null
    ? { renames: new Map(), error: "rename map could not be read" }
    : { renames: parseRenameMap(output), error: null };
}

module.exports = { readBaselineRuleEntries, renameMapFromBase };
