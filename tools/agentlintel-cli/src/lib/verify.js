// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const YAML = require("yaml");
const { readYaml, readJson, walk, matchAny, sameDirectory } = require("./io");
const {
  runRule,
  prepareRule,
  requiredRegexViolations,
  collectExemptionSpans,
  layerOfPath,
  validateLayersRule,
} = require("./engines");

const KERNEL_DIR = ".agentlintel";
const SKIP_PREFIXES = [`${KERNEL_DIR}/conformance`, `${KERNEL_DIR}/reports`];
const ENTRY_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function validEntryId(value) {
  return typeof value === "string" && ENTRY_ID.test(value) && !WINDOWS_DEVICE.test(value);
}

function kernelShape(doc, label, collection) {
  const problems = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    problems.push(`KERNEL-SCHEMA [${label}] expected YAML object`);
  } else {
    const allowedKeys = new Set(["version", collection, "$comment"]);
    for (const key of Object.keys(doc))
      if (!allowedKeys.has(key))
        problems.push(`KERNEL-SCHEMA [${label}] unknown top-level key '${key}'`);
    if (doc.version !== 2)
      problems.push(`KERNEL-SCHEMA [${label}] version must be 2`);
    if (!Array.isArray(doc[collection]))
      problems.push(`KERNEL-SCHEMA [${label}] ${collection} must be an array`);
    else {
      const seen = new Set();
      for (const [index, entry] of doc[collection].entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          problems.push(
            `KERNEL-SCHEMA [${label}] ${collection}[${index}] must be an object`,
          );
          continue;
        }
        if (!validEntryId(entry.id)) {
          problems.push(
            `KERNEL-SCHEMA [${label}] ${collection}[${index}] has invalid id '${entry.id || "(missing)"}'`,
          );
          continue;
        }
        if (seen.has(entry.id))
          problems.push(
            `KERNEL-SCHEMA [${label}] duplicate id '${entry.id}'`,
          );
        seen.add(entry.id);
      }
    }
  }
  return problems;
}

function guardShape(doc, label) {
  const problems = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    return [`KERNEL-SCHEMA [${label}] expected JSON object`];
  for (const key of Object.keys(doc))
    if (!["version", "zones", "forbidden", "$comment"].includes(key))
      problems.push(`KERNEL-SCHEMA [${label}] unknown top-level key '${key}'`);
  if (doc.version !== 2)
    problems.push(`KERNEL-SCHEMA [${label}] version must be 2`);
  if (!Array.isArray(doc.zones)) {
    problems.push(`KERNEL-SCHEMA [${label}] zones must be an array`);
  } else {
    const seen = new Set();
    for (const [index, zone] of doc.zones.entries()) {
      if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
        problems.push(`KERNEL-SCHEMA [${label}] zones[${index}] must be an object`);
        continue;
      }
      if (!validEntryId(zone.id))
        problems.push(
          `KERNEL-SCHEMA [${label}] zones[${index}] has invalid id '${zone.id || "(missing)"}'`,
        );
      else if (seen.has(zone.id))
        problems.push(`KERNEL-SCHEMA [${label}] duplicate zone id '${zone.id}'`);
      else seen.add(zone.id);
      if (!Array.isArray(zone.allow) || !zone.allow.length ||
          zone.allow.some((glob) => !isCanonicalRepoScope(glob)))
        problems.push(`KERNEL-SCHEMA [${label}] zone '${zone.id || index}' allow must be a non-empty string array`);
      for (const key of Object.keys(zone))
        if (!["id", "allow", "$comment"].includes(key))
          problems.push(`KERNEL-SCHEMA [${label}] zone '${zone.id || index}' has unknown key '${key}'`);
    }
    if (!(doc.zones || []).some((zone) => Array.isArray(zone && zone.allow) && zone.allow.length))
      problems.push(`KERNEL-SCHEMA [${label}] at least one write-zone allow glob is required`);
  }
  if (doc.forbidden != null &&
      (!Array.isArray(doc.forbidden) || doc.forbidden.some((glob) => !isCanonicalRepoScope(glob))))
    problems.push(`KERNEL-SCHEMA [${label}] forbidden must be a string array`);
  return problems;
}

function loadKernel(root, { nonRegularPaths = null } = {}) {
  const indexedNonRegular = nonRegularPaths ||
    new Map(trackedNonRegularFiles(root).map((entry) => [entry.file, entry.mode]));
  const kernelDir = path.join(root, KERNEL_DIR);
  const kernel = {
    facts: null,
    rules: null,
    guard: null,
    exemplars: null,
    schemaErrors: [],
  };

  const files = [
    ["facts", "facts.yaml", readYaml, (doc, label) => kernelShape(doc, label, "facts")],
    ["rules", "rules.yaml", readYaml, (doc, label) => kernelShape(doc, label, "rules")],
    ["guard", "guard.json", readJson, guardShape],
    ["exemplars", "exemplars.yaml", readYaml, (doc, label) => kernelShape(doc, label, "exemplars")],
  ];
  for (const [key, name, read, shape] of files) {
    const filePath = path.join(kernelDir, name);
    if (!pathEntryExists(filePath)) continue;
    const label = `${KERNEL_DIR}/${name}`;
    if (coveringNonRegular(indexedNonRegular, label) ||
        !safeRegularRepoFile(root, filePath)) {
      kernel.schemaErrors.push(`KERNEL-SCHEMA [${label}] must be a regular file inside the repository`);
      continue;
    }
    try {
      kernel[key] = read(filePath);
      kernel.schemaErrors.push(...shape(kernel[key], label));
    } catch (error) {
      kernel.schemaErrors.push(`KERNEL-SCHEMA [${label}] could not be parsed: ${error.message || error}`);
    }
  }

  return kernel;
}

function isSkippedPrefix(relPath) {
  return SKIP_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix + "/"),
  );
}

function firstGlobIndex(pattern) {
  const indexes = ["*", "?", "[", "{"]
    .map((char) => pattern.indexOf(char))
    .filter((index) => index !== -1);
  return indexes.length ? Math.min(...indexes) : -1;
}

function filesForGlob(root, pattern, treeFiles) {
  if (treeFiles) return treeFiles;

  const normalized = String(pattern || "").replace(/\\/g, "/");
  const globIndex = firstGlobIndex(normalized);
  if (globIndex === -1) {
    return fs.existsSync(path.join(root, normalized)) &&
      !isSkippedPrefix(normalized)
      ? [normalized]
      : [];
  }

  const lastSlash = normalized.slice(0, globIndex).lastIndexOf("/");
  const baseDir = lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
  if (baseDir && isSkippedPrefix(baseDir)) return [];

  const walkRoot = baseDir ? path.join(root, baseDir) : root;
  if (!fs.existsSync(walkRoot)) return [];
  if (!safeRepoDirectory(root, walkRoot))
    throw new Error(`glob base must stay inside the repository: ${baseDir || "."}`);
  return walk(walkRoot, { skipPrefixes: baseDir ? [] : SKIP_PREFIXES })
    .map((file) => (baseDir ? `${baseDir}/${file}` : file))
    .filter((file) => !isSkippedPrefix(file));
}

function isRepoRelative(root, value) {
  if (typeof value !== "string" || !value || value.includes("\0")) return false;
  const relative = path.relative(path.resolve(root), path.resolve(root, value));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isCanonicalRepoScope(value) {
  if (typeof value !== "string" || !value || value.includes("\\") ||
      value.includes(":") ||
      value.startsWith("/") || value.endsWith("/") ||
      path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
      /[\[\]{}]/.test(value)) return false;
  const segments = value.split("/");
  return path.posix.normalize(value) === value &&
    !segments.some((segment) => !segment || segment === "." || segment === "..");
}

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function realPathInside(root, filePath) {
  try {
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(filePath));
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

function safeRepoPath(root, filePath) {
  return pathEntryExists(filePath) && !pathHasSymlink(root, filePath) &&
    realPathInside(root, filePath);
}

function safeRegularRepoFile(root, filePath) {
  try {
    return fs.lstatSync(filePath).isFile() && safeRepoPath(root, filePath);
  } catch {
    return false;
  }
}

function safeRepoDirectory(root, filePath) {
  try {
    return fs.lstatSync(filePath).isDirectory() && safeRepoPath(root, filePath);
  } catch {
    return false;
  }
}

function inventoryPathProblem(files, relPath, { directory = false, absent = false } = {}) {
  if (!Array.isArray(files)) return null;
  const exact = (file) => file === relPath || (directory && file.startsWith(`${relPath}/`));
  if (!absent)
    return files.some(exact)
      ? null
      : "path spelling is not present in the repository inventory";

  const folded = relPath.toLowerCase();
  const alias = files.find((file) => {
    const candidate = file.toLowerCase();
    return (candidate === folded || candidate.startsWith(`${folded}/`)) &&
      file !== relPath && !file.startsWith(`${relPath}/`);
  });
  return alias ? `path aliases repository entry '${alias}' with different spelling` : null;
}

function factConfigProblem(fact) {
  if (typeof fact.id !== "string" || !validEntryId(fact.id)) return "invalid fact id";
  if (typeof fact.claim !== "string" || !fact.claim.trim()) return "claim must be non-empty";
  if (Object.keys(fact).some((key) => !["id", "claim", "check"].includes(key)))
    return "fact contains an unknown key";
  const check = fact.check;
  if (!check || typeof check !== "object" || Array.isArray(check)) return "check must be an object";
  const fields = {
    path_exists: ["type", "path"],
    file_absent: ["type", "path"],
    file_contains: ["type", "path", "pattern"],
    line_count_max: ["type", "path", "max"],
    byte_count_max: ["type", "path", "max"],
    glob_count: ["type", "pattern", "min", "max"],
    frontmatter_byte_count_max: ["type", "pattern", "max"],
    command: ["type", "run", "expect_exit", "timeout_ms"],
    pending: ["type", "note"],
  };
  if (!fields[check.type]) return `unknown check type '${check.type}'`;
  if (Object.keys(check).some((key) => !fields[check.type].includes(key)))
    return `check '${check.type}' contains an unknown key`;
  if (["path_exists", "file_absent", "file_contains", "line_count_max", "byte_count_max"]
    .includes(check.type) && (typeof check.path !== "string" || !check.path))
    return `${check.type} requires path`;
  if (check.type === "file_contains" && (typeof check.pattern !== "string" || !check.pattern))
    return "file_contains requires a non-empty pattern";
  if (["line_count_max", "byte_count_max", "frontmatter_byte_count_max"].includes(check.type) &&
      (!Number.isSafeInteger(check.max) || check.max < 0))
    return `${check.type} requires a non-negative integer max`;
  if (["glob_count", "frontmatter_byte_count_max"].includes(check.type) &&
      (typeof check.pattern !== "string" || !check.pattern))
    return `${check.type} requires pattern`;
  if (check.type === "glob_count") {
    if (check.min == null && check.max == null) return "glob_count requires min or max";
    if ([check.min, check.max].some((value) => value != null &&
        (!Number.isSafeInteger(value) || value < 0)))
      return "glob_count bounds must be non-negative integers";
    if (check.min != null && check.max != null && check.min > check.max)
      return "glob_count min must not exceed max";
  }
  if (check.type === "command") {
    if (typeof check.run !== "string" || !check.run.trim() || check.run.includes("\0"))
      return "command requires a non-empty run string";
    if (check.expect_exit != null && !Number.isSafeInteger(check.expect_exit))
      return "command expect_exit must be an integer";
    if (check.timeout_ms != null && (!Number.isSafeInteger(check.timeout_ms) || check.timeout_ms < 1))
      return "command timeout_ms must be a positive integer";
  }
  if (check.type === "pending" && (typeof check.note !== "string" || !check.note.trim()))
    return "pending requires a non-empty note";
  return null;
}

function verifyFacts(
  root,
  factsDoc,
  { run = true, treeFiles = null, nonRegularPaths = new Map() } = {},
) {
  const results = [];
  const facts = Array.isArray(factsDoc && factsDoc.facts) ? factsDoc.facts : [];

  for (const [index, fact] of facts.entries()) {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
      results.push({
        id: `(invalid-${index})`,
        claim: "Invalid fact entry",
        ok: false,
        pending: false,
        skipped: false,
        detail: "fact must be an object",
      });
      continue;
    }
    const check = fact.check || {};
    let ok = false;
    let pending = false;
    let detail = "";
    let skipped = false;
    const configProblem = factConfigProblem(fact);
    if (configProblem) {
      results.push({
        id: fact.id || `(invalid-${index})`,
        claim: fact.claim || "Invalid fact entry",
        ok: false,
        pending: false,
        skipped: false,
        detail: configProblem,
      });
      continue;
    }

    const pathCheck = new Set([
      "path_exists",
      "file_absent",
      "file_contains",
      "line_count_max",
      "byte_count_max",
    ]).has(check.type);
    const scopedValue = pathCheck
      ? check.path
      : ["glob_count", "frontmatter_byte_count_max"].includes(check.type)
        ? check.pattern
        : null;
    if (scopedValue != null &&
        (!isCanonicalRepoScope(scopedValue) || !isRepoRelative(root, scopedValue))) {
      results.push({
        id: fact.id,
        claim: fact.claim,
        ok: false,
        pending: false,
        skipped: false,
        detail: `check path must be canonical and stay inside the repository: ${scopedValue}`,
      });
      continue;
    }
    const nonRegularProblem = scopedValue == null
      ? null
      : nonRegularFactProblem(nonRegularPaths, scopedValue, check.type);
    if (nonRegularProblem) {
      results.push({
        id: fact.id,
        claim: fact.claim,
        ok: false,
        pending: false,
        skipped: false,
        detail: nonRegularProblem,
      });
      continue;
    }
    if (pathCheck) {
      const absolutePath = path.join(root, scopedValue);
      let directory = false;
      try {
        directory = check.type === "path_exists" &&
          fs.lstatSync(absolutePath).isDirectory();
      } catch {}
      const inventoryProblem = inventoryPathProblem(treeFiles, scopedValue, {
        directory,
        absent: check.type === "file_absent",
      });
      if (inventoryProblem) {
        results.push({
          id: fact.id,
          claim: fact.claim,
          ok: false,
          pending: false,
          skipped: false,
          detail: inventoryProblem,
        });
        continue;
      }
    }
    if (pathCheck) {
      const checkedPath = path.join(root, check.path);
      const readsFile = ["file_contains", "line_count_max", "byte_count_max"].includes(check.type);
      if (pathEntryExists(checkedPath) &&
          !(readsFile ? safeRegularRepoFile(root, checkedPath) : safeRepoPath(root, checkedPath))) {
        results.push({
          id: fact.id,
          claim: fact.claim,
          ok: false,
          pending: false,
          skipped: false,
          detail: `check target must stay inside the repository${readsFile ? " and be a regular file" : ""}: ${check.path}`,
        });
        continue;
      }
    }

    try {
      if (check.type === "path_exists") {
        ok = fs.existsSync(path.join(root, check.path));
        detail = ok ? "" : `missing: ${check.path}`;
      } else if (check.type === "file_absent") {
        ok = !fs.existsSync(path.join(root, check.path));
        detail = ok ? "" : `must not exist, but does: ${check.path}`;
      } else if (check.type === "file_contains") {
        const filePath = path.join(root, check.path);
        if (fs.existsSync(filePath)) {
          ok = new RegExp(check.pattern).test(fs.readFileSync(filePath, "utf8"));
          detail = ok ? "" : `pattern not found in ${check.path}: ${check.pattern}`;
        } else {
          detail = `missing: ${check.path}`;
        }
      } else if (check.type === "line_count_max") {
        const filePath = path.join(root, check.path);
        if (fs.existsSync(filePath)) {
          const text = fs.readFileSync(filePath, "utf8");
          // Count logical lines; a trailing newline does not add an empty line.
          const lineCount =
            text === "" ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
          ok = lineCount <= check.max;
          detail = ok
            ? ""
            : `${check.path} has ${lineCount} lines, budget is ${check.max}`;
        } else {
          detail = `missing: ${check.path}`;
        }
      } else if (check.type === "byte_count_max") {
        const filePath = path.join(root, check.path);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath);
          let crlf = 0;
          for (let index = 1; index < content.length; index++)
            if (content[index] === 10 && content[index - 1] === 13) crlf++;
          const byteCount = content.length - crlf;
          ok = byteCount <= check.max;
          detail = ok
            ? ""
            : `${check.path} is ${byteCount} bytes, budget is ${check.max}`;
        } else {
          detail = `missing: ${check.path}`;
        }
      } else if (check.type === "glob_count") {
        const matches = filesForGlob(root, check.pattern, treeFiles).filter(
          (file) => matchAny([check.pattern], file),
        );
        const unsafe = matches.find((file) =>
          nonRegularPaths.has(file) ||
          !safeRegularRepoFile(root, path.join(root, file)));
        if (unsafe) throw new Error(`glob matched non-regular evidence: ${unsafe}`);
        const count = matches.length;
        const min = check.min ?? 0;
        const max = check.max ?? Infinity;
        ok = count >= min && count <= max;
        detail = ok
          ? ""
          : `glob '${check.pattern}' matched ${count} file(s), expected ${check.min != null ? `>= ${check.min}` : ""}${check.min != null && check.max != null ? " and " : ""}${check.max != null ? `<= ${check.max}` : ""}`;
      } else if (check.type === "frontmatter_byte_count_max") {
        if (!Number.isSafeInteger(check.max) || check.max < 0)
          throw new Error("frontmatter_byte_count_max requires a non-negative integer max");
        const matches = filesForGlob(root, check.pattern, treeFiles).filter((file) =>
          matchAny([check.pattern], file));
        if (!matches.length) throw new Error("frontmatter_byte_count_max matched no files");
        let byteCount = 0;
        for (const file of matches) {
          const filePath = path.join(root, file);
          if (nonRegularPaths.has(file) || !safeRegularRepoFile(root, filePath))
            throw new Error(`frontmatter matched non-regular evidence: ${file}`);
          const frontmatter = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n")
            .match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
          if (!frontmatter) throw new Error(`missing YAML frontmatter: ${file}`);
          byteCount += Buffer.byteLength(frontmatter[0], "utf8");
        }
        ok = byteCount <= check.max;
        detail = ok ? "" : `frontmatter totals ${byteCount} bytes, budget is ${check.max}`;
      } else if (check.type === "command") {
        if (run) {
          if (check.timeout_ms != null &&
              (!Number.isSafeInteger(check.timeout_ms) || check.timeout_ms < 1))
            throw new Error("command timeout_ms must be a positive integer");
          const spawned = spawnSync(check.run, {
            cwd: root,
            shell: true,
            timeout: check.timeout_ms || 120000,
            encoding: "utf8",
          });
          const expected = check.expect_exit ?? 0;
          ok = spawned.status === expected;
          detail = ok
            ? ""
            : `'${check.run}' exited ${spawned.status}, expected ${expected}`;
        } else {
          ok = true;
          skipped = true;
          detail = "skipped (--no-run)";
        }
      } else if (check.type === "pending") {
        pending = true;
        detail = check.note;
      } else {
        detail = `unknown check type '${check.type}'`;
      }
    } catch (error) {
      detail = String(error.message || error);
    }

    results.push({
      id: fact.id,
      claim: fact.claim,
      ok,
      pending,
      skipped,
      detail,
    });
  }

  return results;
}

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|cs|py|go|java|rb|php|rs|kt|swift|c|cc|cpp|cxx|h|hh|hpp|hxx|scala|ex|exs|sql|yaml|yml|json|md|sh|ps1)$/i;
const MAX_SCAN_BYTES = 2097152;
const ALWAYS_SKIPPED_SEGMENTS = new Set([".git", "node_modules", ".venv", "venv"]);
const GENERATED_ROOTS = new Set(["dist", "build", "bin-cache", "target", "vendor"]);
const KERNEL_CONFIG_PATHS = new Set([
  ".agentlintel/facts.yaml",
  ".agentlintel/rules.yaml",
  ".agentlintel/guard.json",
  ".agentlintel/exemplars.yaml",
]);

function pathSegments(filePath) {
  return String(filePath || "").split("/").filter(Boolean);
}

function anchoredGeneratedRoot(rule, rootName) {
  if (!Array.isArray(rule.applies_to)) return false;
  return rule.applies_to.some((glob) => {
    const normalized = String(glob || "").replace(/\\/g, "/").replace(/^\.\//, "");
    const first = normalized.split("/", 1)[0];
    return first === rootName;
  });
}

function literalGlobPrefix(glob) {
  const normalized = String(glob || "").replace(/\\/g, "/").replace(/^\.\//, "");
  const index = firstGlobIndex(normalized);
  return (index === -1 ? normalized : normalized.slice(0, index))
    .replace(/\/$/, "");
}

function pathPrefixesOverlap(left, right) {
  return Boolean(left && right) &&
    (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`));
}

function fullyExcludedBoundary(rule, boundary, directoryLike) {
  return (rule.excludes || []).some((glob) => {
    const normalized = String(glob || "").replace(/\\/g, "/").replace(/^\.\//, "");
    if (!directoryLike && normalized === boundary) return true;
    const suffix = normalized.endsWith("/**/*") ? "/**/*"
      : normalized.endsWith("/**") ? "/**" : null;
    if (!suffix) return false;
    const prefix = normalized.slice(0, -suffix.length);
    return Boolean(prefix) &&
      (boundary === prefix || boundary.startsWith(`${prefix}/`));
  });
}

function nonRegularRuleGoverns(rule, boundary, mode, targetKind = "unknown") {
  const directoryLike = mode === "160000" || targetKind !== "file";
  if (ruleSkipsPath(rule, boundary) ||
      fullyExcludedBoundary(rule, boundary, directoryLike))
    return false;
  if (!directoryLike) return ruleScansFile(rule, boundary);
  if (!Array.isArray(rule.applies_to)) return true;
  const prefixes = rule.applies_to.map(literalGlobPrefix).filter(Boolean);
  return rule.applies_to.some((glob) => !literalGlobPrefix(glob)) ||
    prefixes.some((prefix) => pathPrefixesOverlap(prefix, boundary));
}

function symlinkTargetKind(absolutePath, mode) {
  if (mode !== "120000") return mode === "160000" ? "directory" : "unknown";
  try {
    if (fs.lstatSync(absolutePath).isSymbolicLink())
      return fs.statSync(absolutePath).isDirectory() ? "directory" : "file";
    const target = fs.readFileSync(absolutePath, "utf8").trim();
    if (!target || target.includes("\0")) return "unknown";
    return fs.statSync(path.resolve(path.dirname(absolutePath), target)).isDirectory()
      ? "directory" : "file";
  } catch {
    return "unknown";
  }
}

function ruleSkipsPath(rule, filePath) {
  const segments = pathSegments(filePath);
  if (segments.some((segment) => ALWAYS_SKIPPED_SEGMENTS.has(segment))) return true;
  if (KERNEL_CONFIG_PATHS.has(filePath) &&
      !anchoredGeneratedRoot(rule, ".agentlintel")) return true;
  const rootName = segments[0];
  return GENERATED_ROOTS.has(rootName) && !anchoredGeneratedRoot(rule, rootName);
}

function ruleApplies(rule, filePath) {
  const appliesTo =
    rule._appliesTo ||
    (rule.applies_to && rule.applies_to.length ? rule.applies_to : ["**/*"]);
  if (!matchAny(appliesTo, filePath)) return false;
  const excludes = rule._excludes || rule.excludes;
  return !excludes || !matchAny(excludes, filePath);
}

function annotateRuleViolations(rule, violations) {
  if (!rule || !rule.adr) return violations;
  for (const violation of violations)
    if (!violation.adr) violation.adr = rule.adr;
  return violations;
}

function preparedRuleSet(rulesDoc) {
  const all = [];
  const configErrors = [];
  const seenIds = new Set();
  const validEngines = new Set([
    "regex",
    "error-codes",
    "exemptions",
    "layers",
    "external",
  ]);
  const validSeverities = new Set(["error", "warn", "warning"]);
  const validAdapters = new Set([
    "jsonl",
    "dependency-cruiser",
    "dotnet-test",
    "command-status",
    "status",
  ]);

  for (const rule of rulesDoc && Array.isArray(rulesDoc.rules) ? rulesDoc.rules : []) {
    const id = rule && rule.id ? rule.id : "(unnamed)";
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      configErrors.push(`RULE-CONFIG [${id}] rule entry must be an object`);
      continue;
    }
    if (!validEntryId(rule.id)) {
      configErrors.push(`RULE-CONFIG [${id}] id must be a path-safe lowercase identifier`);
      continue;
    }
    if (seenIds.has(rule.id)) {
      configErrors.push(`RULE-CONFIG [${id}] duplicate rule id`);
      continue;
    }
    seenIds.add(rule.id);
    if (!validEngines.has(rule.engine)) {
      configErrors.push(
        `RULE-CONFIG [${id}] unknown engine '${rule.engine || "(missing)"}'`,
      );
      continue;
    }
    let structurallyValid = true;
    const reject = (message) => {
      configErrors.push(`RULE-CONFIG [${id}] ${message}`);
      structurallyValid = false;
    };
    const commonKeys = [
      "id", "severity", "engine", "adr", "applies_to", "excludes",
      "must_match", "message", "$comment",
    ];
    const engineKeys = {
      regex: ["forbidden", "required", "when", "flags", "match"],
      "error-codes": ["categories"],
      exemptions: ["marker", "required_fields", "within_lines"],
      layers: ["layers", "allowed", "aliases"],
      external: ["run", "adapter", "format", "scope", "ok_exits", "timeout_ms", "file", "evidence"],
    };
    const allowedKeys = new Set([...commonKeys, ...engineKeys[rule.engine]]);
    for (const key of Object.keys(rule))
      if (!allowedKeys.has(key)) reject(`unknown option '${key}'`);
    if (!validSeverities.has(String(rule.severity || "").toLowerCase()))
      reject("severity must be error, warn, or warning");
    if (rule.adr != null) {
      const refs = Array.isArray(rule.adr) ? rule.adr : [rule.adr];
      if (!refs.length || refs.some((ref) => typeof ref !== "string" || !/^ADR-\d+$/.test(ref)))
        reject("adr must be an ADR-<number> string or non-empty array of them");
    }
    if (rule.applies_to != null &&
        (!Array.isArray(rule.applies_to) || !rule.applies_to.length ||
          rule.applies_to.some((glob) => !isCanonicalRepoScope(glob))))
      reject("applies_to must be a non-empty string array");
    if (rule.excludes != null &&
        (!Array.isArray(rule.excludes) || rule.excludes.some((glob) => !isCanonicalRepoScope(glob))))
      reject("excludes must be a string array");
    if (rule.must_match != null && typeof rule.must_match !== "boolean")
      reject("must_match must be a boolean");
    if (typeof rule.message !== "string" || !rule.message.trim())
      reject("message must be a non-empty string");

    if (rule.engine === "regex") {
      const validPatterns = (value) => Array.isArray(value) && value.length &&
        value.every((pattern) => typeof pattern === "string" && pattern);
      if (!validPatterns(rule.forbidden) && !validPatterns(rule.required))
        reject("regex rules require forbidden or required patterns");
      if (rule.forbidden != null && !validPatterns(rule.forbidden))
        reject("regex forbidden must be a non-empty string array");
      if (rule.required != null && !validPatterns(rule.required))
        reject("regex required must be a non-empty string array");
      if (rule.when != null && !validPatterns(rule.when))
        reject("regex when must be a non-empty string array");
      if (rule.when != null && !validPatterns(rule.required))
        reject("regex when requires positive required patterns");
      if (rule.match != null && !["line", "file"].includes(rule.match))
        reject("regex match must be line or file");
    }
    if (rule.engine === "error-codes" &&
        (!Array.isArray(rule.categories) || !rule.categories.length ||
          rule.categories.some((category) => typeof category !== "string" || !category)))
      reject("error-codes rules require categories");
    if (rule.engine === "exemptions" &&
        (!Array.isArray(rule.required_fields) || !rule.required_fields.length ||
          rule.required_fields.some((field) => typeof field !== "string" || !field)))
      reject("exemptions rules require required_fields");
    if (rule.engine === "exemptions" && Array.isArray(rule.required_fields) &&
        !rule.required_fields.includes("Expires"))
      reject("exemptions required_fields must include Expires");
    if (rule.engine === "exemptions" && Array.isArray(rule.required_fields) &&
        !rule.required_fields.includes("Decision"))
      reject("exemptions required_fields must include Decision");
    if (rule.engine === "exemptions" &&
        (!Number.isInteger(rule.within_lines) || rule.within_lines < 1))
      reject("exemptions rules require a positive within_lines integer");
    if (rule.engine === "layers") {
      if (!Array.isArray(rule.layers) || !rule.layers.length ||
          !rule.allowed || typeof rule.allowed !== "object" || Array.isArray(rule.allowed)) {
        reject("layers rules require layers and an allowed map");
      } else {
        for (const problem of validateLayersRule(rule)) reject(problem);
        for (const layer of rule.layers)
          if (layer && Array.isArray(layer.path) &&
              layer.path.some((glob) => !isCanonicalRepoScope(glob)))
            reject(`layer '${layer.name}' paths must be canonical forward-slash globs`);
        if (rule.aliases != null &&
            (!rule.aliases || typeof rule.aliases !== "object" || Array.isArray(rule.aliases) ||
              Object.entries(rule.aliases).some(([alias, target]) => !alias || typeof target !== "string" || !target)))
          reject("layers aliases must map non-empty prefixes to non-empty strings");
      }
    }
    if (rule.engine === "external") {
      if (typeof rule.run !== "string" || !rule.run.trim() || rule.run.includes("\0"))
        reject("external rules require run");
      if (!Array.isArray(rule.evidence) || !rule.evidence.length ||
          rule.evidence.some((file) =>
            !isCanonicalRepoScope(file) || /[*?]/.test(file)))
        reject("external rules require non-empty exact evidence file paths");
      const adapter = rule.adapter || rule.format || "jsonl";
      if (!validAdapters.has(adapter))
        reject(`unknown external adapter '${adapter}'`);
      if (rule.scope != null && !["tree", "commit", "pr"].includes(rule.scope))
        reject("external scope must be tree, commit, or pr");
      if (rule.ok_exits != null &&
          (!Array.isArray(rule.ok_exits) || !rule.ok_exits.length ||
            rule.ok_exits.some((code) => !Number.isInteger(code))))
        reject("external ok_exits must be an integer array");
      if (rule.timeout_ms != null &&
          (!Number.isSafeInteger(rule.timeout_ms) || rule.timeout_ms < 1))
        reject("external timeout_ms must be a positive integer");
    }
    if (!structurallyValid) continue;
    try {
      all.push(prepareRule(rule));
    } catch (error) {
      configErrors.push(`RULE-CONFIG [${id}] ${error.message || error}`);
    }
  }

  if (all.filter((rule) => rule.engine === "exemptions").length > 1)
    configErrors.push("RULE-CONFIG [exemptions] at most one exemptions rule may provide suppression spans");

  return {
    all,
    fileRules: all.filter((rule) => rule.engine !== "external"),
    externalRules: all.filter((rule) => rule.engine === "external"),
    configErrors,
  };
}

function ruleScansFile(rule, filePath) {
  const explicitScope = Array.isArray(rule.applies_to) && rule.applies_to.length > 0;
  return !ruleSkipsPath(rule, filePath) &&
    (TEXT_EXT.test(filePath) || explicitScope) && ruleApplies(rule, filePath);
}

function changedBaselineEntries(root, rule, changed, base) {
  if (!changed || !Array.isArray(changed.files) || changed.baseResolved === false ||
      !(rule.when || []).length)
    return [];
  const entries = [];
  const baselineRef = base || "HEAD";
  for (const filePath of changed.files) {
    if (!ruleScansFile(rule, filePath)) continue;
    const baseline = gitBlob(root, baselineRef, filePath);
    if (baseline.status === "read" && Buffer.byteLength(baseline.content) <= MAX_SCAN_BYTES)
      entries.push({ filePath, content: baseline.content });
  }
  return entries;
}

function runRulesOnFiles(root, rulesDoc, files, options = {}) {
  const violations = [];
  const spans = [];
  const rules = options.rules || preparedRuleSet(rulesDoc).fileRules;
  const exemptionRule = rules.find((rule) => rule.engine === "exemptions");
  const nonRegularPaths = options.nonRegularPaths || new Map();
  const ruleFileCounts = new Map(rules.map((rule) => [rule.id, 0]));
  const requiredEntries = new Map(
    rules
      .filter((rule) => rule.engine === "regex" && rule._requiredRegexes.length)
      .map((rule) => [rule.id, []]),
  );

  if (!rules.length) return { violations, spans, ruleFileCounts };

  for (const filePath of files) {
    if (isSkippedPrefix(filePath)) continue;
    const absolutePath = path.join(root, filePath);
    const applicable = rules.filter((rule) => ruleScansFile(rule, filePath));
    try {
      const gitMode = nonRegularPaths.get(filePath);
      const symbolic = fs.lstatSync(absolutePath).isSymbolicLink();
      const mode = gitMode || (symbolic ? "120000" : null);
      const targetKind = mode ? symlinkTargetKind(absolutePath, mode) : "unknown";
      if (mode && rules.some((rule) =>
        nonRegularRuleGoverns(rule, filePath, mode, targetKind))) {
        violations.push({
          rule: "agentlintel.scan-failure",
          file: filePath,
          line: 0,
          message: gitMode
            ? `Git mode ${gitMode} is not a regular scan input`
            : "symbolic links are not deterministic scan inputs",
          severity: "error",
        });
        continue;
      }
    } catch {}
    if (!applicable.length) continue;

    let content;
    try {
      if (!safeRegularRepoFile(root, absolutePath))
        throw new Error("path is not a regular repository file");
      const byteCount = fs.statSync(absolutePath).size;
      if (byteCount > MAX_SCAN_BYTES) {
        violations.push({
          rule: "agentlintel.scan-limit",
          file: filePath,
          line: 0,
          message: `file is ${byteCount} bytes; scan limit is ${MAX_SCAN_BYTES}`,
          severity: "error",
        });
        continue;
      }
      content = fs.readFileSync(absolutePath, "utf8");
    } catch (error) {
      violations.push({
        rule: "agentlintel.scan-failure",
        file: filePath,
        line: 0,
        message: `file could not be scanned: ${error.message || error}`,
        severity: "error",
      });
      continue;
    }

    for (const rule of applicable) {
      // A layers rule only "covers" a file that lands in a declared layer.
      if (rule.engine !== "layers" || layerOfPath(rule.layers || [], filePath))
        ruleFileCounts.set(rule.id, ruleFileCounts.get(rule.id) + 1);
      violations.push(
        ...annotateRuleViolations(
          rule,
          runRule(rule, filePath, content, { skipApplies: true }),
        ),
      );
      if (requiredEntries.has(rule.id))
        requiredEntries.get(rule.id).push({ filePath, content });
    }

    if (
      exemptionRule &&
      content.includes(exemptionRule._marker) &&
      ruleApplies(exemptionRule, filePath)
    )
      spans.push(
        ...collectExemptionSpans(exemptionRule, filePath, content, {
          skipApplies: true,
        }),
      );
  }

  if (!options.partial)
    for (const rule of rules)
      if (requiredEntries.has(rule.id))
        violations.push(
          ...annotateRuleViolations(
            rule,
            requiredRegexViolations(rule, requiredEntries.get(rule.id), {
              baselineEntries: changedBaselineEntries(
                root,
                rule,
                options.changed,
                options.base,
              ),
            }),
          ),
        );

  return { violations, spans, ruleFileCounts };
}

function runExternalRules(root, rulesDoc, { run = true, rules = null } = {}) {
  const violations = [];
  const statuses = [];
  const externalRules = rules || preparedRuleSet(rulesDoc).externalRules;

  for (const rule of externalRules) {
    if (!run) {
      statuses.push({ rule: rule.id, status: "skipped (--no-run)" });
      continue;
    }

    let spawned;
    try {
      spawned = spawnSync(rule.run, {
        cwd: root,
        shell: true,
        timeout: rule.timeout_ms || 300000,
        encoding: "utf8",
        maxBuffer: 16777216,
      });
    } catch (error) {
      spawned = { status: null, stdout: "", stderr: "", error };
    }
    const outcome = externalOutcome(rule, {
      status: spawned.status,
      stdout: spawned.stdout || "",
      stderr: spawned.stderr || "",
      error: spawned.error,
    });
    violations.push(...outcome.violations);
    statuses.push({ rule: rule.id, status: outcome.status });
  }

  return { violations, statuses };
}

function externalOutcome(rule, { status = 0, stdout = "", stderr = "", error = null } = {}) {
  let parsed = [];
  try {
    parsed = parseExternalOutput(rule, stdout, { status, stderr });
  } catch (parseError) {
    error = error || parseError;
  }
  const okExits = rule.ok_exits || [0, 1];
  if (!error && status !== null && okExits.includes(status) &&
      (status === 0 || parsed.length > 0))
    return { violations: parsed, status: "ran" };

  const stderrSummary = String(stderr)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" | ");
  const reason = error
    ? String(error)
    : status === null
      ? "timeout"
      : `exit ${status}${parsed.length === 0 ? ", no violations parsed" : ""}`;
  return {
    status: `engine failed: ${reason}${stderrSummary ? ` - ${stderrSummary}` : ""}`,
    violations: [{
      rule: rule.id,
      file: "(engine)",
      line: 0,
      message: `external engine did not run cleanly (${reason}): ${rule.run}`,
      // Tool failure is verifier failure, even when the rule's ordinary
      // findings are advisory.
      severity: "error",
      adr: rule.adr,
    }],
  };
}

function parseExternalOutput(rule, stdout, meta = {}) {
  const adapter = rule.adapter || rule.format || "jsonl";
  if (adapter === "dependency-cruiser")
    return annotateRuleViolations(rule, parseDependencyCruiserOutput(rule, stdout));
  if (adapter === "dotnet-test")
    return annotateRuleViolations(rule, parseDotnetTestOutput(rule, stdout, meta));
  if (adapter === "command-status" || adapter === "status")
    return annotateRuleViolations(
      rule,
      parseCommandStatusOutput(rule, stdout, meta),
    );

  const violations = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("{"))
      throw new Error("external JSONL output contains a non-JSON record");
    try {
      const entry = JSON.parse(trimmed);
      if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
          typeof entry.file !== "string" || !entry.file ||
          (entry.line != null && (!Number.isInteger(entry.line) || entry.line < 0)) ||
          (entry.message != null && typeof entry.message !== "string"))
        throw new Error("JSONL records require file and valid optional line/message fields");
      violations.push({
        rule: rule.id,
        file: entry.file.replace(/\\/g, "/"),
        line: entry.line ?? 0,
        message: entry.message || rule.message || "external engine violation",
        severity: rule.severity,
      });
    } catch (error) {
      throw new Error(`invalid external JSONL record: ${error.message || error}`);
    }
  }
  return annotateRuleViolations(rule, violations);
}

function parseCommandStatusOutput(rule, stdout, { status = 0, stderr = "" } = {}) {
  if (status === 0) return [];

  const lines = String((stdout || "") + "\n" + (stderr || ""))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary =
    lines.find((line) => !/^npm (ERR|WARN)!?/i.test(line)) ||
    lines[0] ||
    "command exited " + status;
  const file =
    rule.file ||
    (rule.scope === "pr"
      ? "(pr-policy)"
      : rule.scope === "commit"
        ? "(commit-policy)"
        : "(command-status)");

  return [
    {
      rule: rule.id,
      file,
      line: 0,
      message: (rule.message || "external command failed") + ": " + summary,
      severity: rule.severity,
    },
  ];
}

function jsonFromOutput(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function ruleNameOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.name || value.rule || value.id || value.description || null;
}

function depCruiserViolation(rule, file, line, ruleName, from, to, comment) {
  const edge = from && to ? `${from} -> ${to}` : from || to || file;
  const message = [ruleName || rule.message || "dependency-cruiser violation", edge, comment]
    .filter(Boolean)
    .join(": ");
  return {
    rule: rule.id,
    file: file || from || "(dependency-cruiser)",
    line: line || 0,
    message,
    severity: rule.severity,
  };
}

function parseDependencyCruiserOutput(rule, stdout) {
  const doc = jsonFromOutput(stdout);
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    throw new Error("dependency-cruiser output must be a JSON object");

  const violations = [];
  const groups = [
    doc.summary && doc.summary.violations,
    doc.violations,
    doc.validation && doc.validation.violations,
  ].filter((value) => value != null);
  if (groups.some((value) => !Array.isArray(value)))
    throw new Error("dependency-cruiser violations must be arrays");
  if (doc.modules != null && !Array.isArray(doc.modules))
    throw new Error("dependency-cruiser modules must be an array");
  if (!Array.isArray(doc.modules) && groups.length === 0)
    throw new Error("dependency-cruiser output has no recognizable modules or violations array");
  const reported = groups.flat();

  for (const entry of reported) {
    const from = entry.from || entry.source || entry.module || entry.file;
    const to = entry.to || entry.resolved || entry.target || entry.dependency;
    const name = ruleNameOf(entry.rule) || entry.ruleName || entry.name;
    violations.push(
      depCruiserViolation(
        rule,
        from,
        entry.line || entry.fromLine,
        name,
        from,
        to,
        entry.comment || entry.message,
      ),
    );
  }

  for (const module of doc.modules || []) {
    const source = module.source || module.sourceFile || module.path || module.name;
    for (const dependency of module.dependencies || []) {
      const target =
        dependency.resolved ||
        dependency.module ||
        dependency.dependency ||
        dependency.target;
      for (const ruleEntry of dependency.rules || dependency.violations || [])
        violations.push(
          depCruiserViolation(
            rule,
            source,
            dependency.line || dependency.lineNumber,
            ruleNameOf(ruleEntry),
            source,
            target,
            ruleEntry.comment || ruleEntry.message,
          ),
        );
    }
    for (const ruleEntry of module.rules || module.violations || [])
      violations.push(
        depCruiserViolation(
          rule,
          source,
          module.line || module.lineNumber,
          ruleNameOf(ruleEntry),
          source,
          null,
          ruleEntry.comment || ruleEntry.message,
        ),
      );
  }

  return violations;
}

function parseDotnetTestOutput(rule, stdout, { status = 0, stderr = "" } = {}) {
  const lines = String(`${stdout || ""}\n${stderr || ""}`)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const failureLine =
    lines.find((line) => /^Failed\s/.test(line)) ||
    lines.find((line) => /Test Run Failed|Error Message|Failed!/i.test(line)) ||
    lines.find(
      (line) =>
        /failed/i.test(line) &&
        !/Failed:\s*0\b/i.test(line) &&
        !/^Passed!/i.test(line),
    );

  if (status === 0 && !failureLine) return [];

  const summary = failureLine || lines.slice(-1)[0] || `dotnet test exited ${status}`;
  return [
    {
      rule: rule.id,
      file: "(dotnet-test)",
      line: 0,
      message: `dotnet test failed: ${summary}`,
      severity: rule.severity,
    },
  ];
}

function applySuppression(violations, spans, unsuppressible = new Set(["exemption.audited"])) {
  for (const violation of violations) {
    if (unsuppressible.has(violation.rule)) continue;
    const covered = spans.some(
      (span) =>
        span.file === violation.file &&
        span.rules.includes(violation.rule) &&
        violation.line >= span.fromLine &&
        violation.line <= span.toLine,
    );
    if (covered) violation.exempted = true;
  }
  return violations;
}

const FIXTURE_TODAY = new Date("2026-07-09T00:00:00Z");

function runFixtures(root, rulesDoc, options = {}) {
  const results = [];
  const rules = options.rules || preparedRuleSet(rulesDoc).all;
  const nonRegularPaths = options.nonRegularPaths || new Map();

  for (const rule of rules) {
    const casesRel = `${KERNEL_DIR}/conformance/${rule.id}/cases`;
    const casesDir = path.join(root, KERNEL_DIR, "conformance", rule.id, "cases");
    if (intersectingNonRegular(nonRegularPaths, casesRel) ||
        !safeRepoDirectory(root, casesDir)) {
      results.push({
        rule: rule.id,
        case: "(none)",
        ok: false,
        detail: "LAW VIOLATION: rule needs a regular in-repository cases directory",
      });
      continue;
    }

    let hasPassingCase = false;
    let hasFailingCase = false;
    const caseEntries = fs.readdirSync(casesDir, { withFileTypes: true });
    for (const entry of caseEntries)
      if (!entry.isDirectory())
        results.push({
          rule: rule.id,
          case: entry.name,
          ok: false,
          detail: "cases/ may contain only regular case directories",
        });
    const caseNames = caseEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const caseName of caseNames) {
      const caseDir = path.join(casesDir, caseName);
      const caseRel = `${casesRel}/${caseName}`;
      const expectedPath = path.join(caseDir, "expected.yaml");
      if (!pathEntryExists(expectedPath)) {
        results.push({
          rule: rule.id,
          case: caseName,
          ok: false,
          detail: "expected.yaml is required",
        });
        continue;
      }
      if (coveringNonRegular(nonRegularPaths, `${caseRel}/expected.yaml`) ||
          !safeRegularRepoFile(caseDir, expectedPath)) {
        results.push({
          rule: rule.id,
          case: caseName,
          ok: false,
          detail: "expected.yaml must be a regular file inside the fixture case",
        });
        continue;
      }

      let expectedDoc;
      try {
        expectedDoc = readYaml(expectedPath);
      } catch (error) {
        results.push({
          rule: rule.id,
          case: caseName,
          ok: false,
          detail: `expected.yaml is invalid: ${error.message || error}`,
        });
        continue;
      }
      if (!expectedDoc || !Array.isArray(expectedDoc.violations) ||
          Object.keys(expectedDoc).some((key) => key !== "violations")) {
        results.push({
          rule: rule.id,
          case: caseName,
          ok: false,
          detail: "expected.yaml must declare a violations array",
        });
        continue;
      }
      const expected = expectedDoc.violations;

      const problems = [];
      let actual = [];
      let exercisesRule = false;
      if (rule.engine === "external") {
        // External fixtures replay recorded output instead of running commands.
        const outputPath = path.join(caseDir, "output.jsonl");
        const statusPath = path.join(caseDir, "status.txt");
        const outputRegular = !coveringNonRegular(
          nonRegularPaths,
          `${caseRel}/output.jsonl`,
        ) && safeRegularRepoFile(caseDir, outputPath);
        const statusRegular = !coveringNonRegular(
          nonRegularPaths,
          `${caseRel}/status.txt`,
        ) && safeRegularRepoFile(caseDir, statusPath);
        if (!pathEntryExists(statusPath))
          problems.push("external fixture requires an explicit status.txt");
        if (pathEntryExists(statusPath) && !statusRegular)
          problems.push("external fixture status.txt must be a regular case file");
        if (pathEntryExists(outputPath) && !outputRegular)
          problems.push("external fixture output.jsonl must be a regular case file");
        const statusText = statusRegular
          ? fs.readFileSync(statusPath, "utf8").trim()
          : "";
        const statusValid = /^\d+$/.test(statusText) && Number.isSafeInteger(Number(statusText));
        const recordedStatus = statusValid ? Number(statusText) : 0;
        if (statusRegular && !statusValid)
          problems.push("external fixture status.txt must contain a non-negative integer exit code");
        exercisesRule = statusRegular && statusValid;
        const output = outputRegular
          ? fs.readFileSync(outputPath, "utf8")
          : "";
        actual = externalOutcome(rule, { status: recordedStatus, stdout: output }).violations;
      } else {
        // Fixture trees are intentionally tiny. Do not hide generated-root
        // paths here: ruleScansFile applies the same opt-in policy as the live
        // repository scan.
        const caseFiles = walk(caseDir, { skipDirs: new Set() })
          .filter((file) => file !== "expected.yaml");
        const requiredEntries = [];
        for (const file of caseFiles) {
          const caseFile = path.join(caseDir, file);
          if (coveringNonRegular(nonRegularPaths, `${caseRel}/${file}`) ||
              !safeRegularRepoFile(caseDir, caseFile)) {
            problems.push(`fixture input must be a regular case file: ${file}`);
            continue;
          }
          const content = fs.readFileSync(caseFile, "utf8");
          if (
            ruleScansFile(rule, file) &&
            (rule.engine !== "layers" || layerOfPath(rule.layers || [], file))
          )
            exercisesRule = true;
          if (ruleScansFile(rule, file)) {
            actual.push(...runRule(rule, file, content, { today: FIXTURE_TODAY }));
            if (rule.engine === "regex" && rule._requiredRegexes.length)
              requiredEntries.push({ filePath: file, content });
          }
        }
        if (rule.engine === "regex")
          actual.push(...requiredRegexViolations(rule, requiredEntries));
      }
      if (!exercisesRule)
        problems.push("fixture contains no file in the rule's effective scope");
      else if (expected.length) hasFailingCase = true;
      else hasPassingCase = true;

      const matched = new Set();
      for (const expectation of expected) {
        if (
          !expectation ||
          typeof expectation !== "object" ||
          Object.keys(expectation).some((key) =>
            !["rule", "file", "line", "message_contains"].includes(key)) ||
          expectation.rule !== rule.id ||
          typeof expectation.file !== "string" ||
          !expectation.file ||
          (expectation.line != null &&
            (!Number.isInteger(expectation.line) || expectation.line < 1)) ||
          (expectation.message_contains != null &&
            typeof expectation.message_contains !== "string")
        ) {
          problems.push(
            `invalid expectation: each violation needs rule '${rule.id}', file, and valid optional line/message_contains`,
          );
          continue;
        }
        const index = actual.findIndex(
          (violation, i) =>
            !matched.has(i) &&
            violation.file === expectation.file &&
            (expectation.line == null || violation.line === expectation.line) &&
            (expectation.message_contains == null ||
              String(violation.message || "").includes(expectation.message_contains)),
        );
        if (index === -1)
          problems.push(
            `expected violation not produced: ${expectation.file}${expectation.line ? ":" + expectation.line : ""}`,
          );
        else matched.add(index);
      }
      actual.forEach((violation, index) => {
        if (!matched.has(index))
          problems.push(`unexpected violation: ${violation.file}:${violation.line}`);
      });

      results.push({
        rule: rule.id,
        case: caseName,
        ok: problems.length === 0,
        detail: problems.join("; "),
      });
    }

    if (!hasPassingCase)
      results.push({
        rule: rule.id,
        case: "(coverage)",
        ok: false,
        detail: "LAW VIOLATION: rule needs at least one passing fixture",
      });
    if (!hasFailingCase)
      results.push({
        rule: rule.id,
        case: "(coverage)",
        ok: false,
        detail: "LAW VIOLATION: rule needs at least one failing fixture",
      });
  }

  return results;
}

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
  return spawned.status === 0 && !spawned.stdout.includes("\uFFFD")
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
  if (names.includes("\uFFFD")) return null;
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

function checkGuard(root, guard, { base = null, treeFiles = null, changed = null } = {}) {
  if (!guard)
    return {
      status: "absent",
      violations: [],
      warnings: [
        "GUARD-ABSENT .agentlintel/guard.json is missing - write-boundary protection is disabled",
      ],
    };

  if (!changed) changed = changedFiles(root, base);
  if (changed.files === null)
    return {
      status: `skipped (${changed.note})`,
      violations: [],
      warnings: [
        `GUARD-VCS ${changed.note} - write-boundary protection requires Git`,
      ],
    };

  const warnings = [];
  if (base && !changed.baseResolved)
    warnings.push(
      `GUARD-BASE base '${base}' could not be resolved - guard checked the working tree only (set fetch-depth: 0 or fetch the base ref)`,
    );

  const zones = Array.isArray(guard.zones)
    ? guard.zones.filter((zone) => zone && typeof zone === "object" && Array.isArray(zone.allow))
    : [];
  const allowGlobs = zones.flatMap((zone) =>
    Array.isArray(zone && zone.allow)
      ? zone.allow.filter((glob) => typeof glob === "string")
      : [],
  );
  const forbidden = Array.isArray(guard.forbidden)
    ? guard.forbidden.filter((glob) => typeof glob === "string")
    : [];
  const violations = [];
  if (allowGlobs.includes("**") || allowGlobs.includes("**/*"))
    warnings.push(
      "GUARD-PERMISSIVE a write zone allows every path - tighten it before strict CI",
    );
  for (const file of changed.files) {
    if (matchAny(forbidden, file))
      violations.push({
        rule: "guard.forbidden",
        file,
        message: "Change touches a forbidden path.",
      });
    else if (allowGlobs.length && !matchAny(allowGlobs, file))
      violations.push({
        rule: "guard.zone",
        file,
        message: "Change is outside every declared write zone.",
      });
  }

  if (treeFiles)
    for (const zone of zones) {
      const allow = (zone.allow || []).filter((glob) => typeof glob === "string");
      if (allow.length && !treeFiles.some((file) => matchAny(allow, file)))
        warnings.push(`GUARD-SCOPE zone '${zone.id}' matches no files in the tree`);
    }

  return {
    status: `checked ${changed.files.length} changed file(s)${changed.note ? ` (${changed.note})` : ""}`,
    violations,
    warnings,
  };
}

function checkExemplars(
  root,
  exemplarsDoc,
  { nonRegularPaths = new Map(), treeFiles = null } = {},
) {
  const results = [];
  const exemplars = Array.isArray(exemplarsDoc && exemplarsDoc.exemplars)
    ? exemplarsDoc.exemplars
    : [];
  for (const [index, exemplar] of exemplars.entries()) {
    if (!exemplar || typeof exemplar !== "object" || Array.isArray(exemplar)) {
      results.push({
        id: `(invalid-${index})`,
        path: "(missing)",
        ok: false,
        detail: "exemplar must be an object",
      });
      continue;
    }
    const unknownKey = Object.keys(exemplar)
      .find((key) => !["id", "shape", "path", "demonstrates", "$comment"].includes(key));
    const malformed = unknownKey
      ? `unknown key '${unknownKey}'`
      : typeof exemplar.shape !== "string" || !exemplar.shape.trim()
        ? "shape must be a non-empty string"
        : typeof exemplar.path !== "string" || !exemplar.path.trim()
          ? "path must be a non-empty string"
          : exemplar.path === "." || exemplar.path.startsWith("./") ||
              exemplar.path.endsWith("/") || exemplar.path.includes("\\") ||
              exemplar.path.includes(":")
              || path.posix.normalize(exemplar.path) !== exemplar.path
            ? "path must be a canonical forward-slash repository path"
          : typeof exemplar.demonstrates !== "string" || !exemplar.demonstrates.trim()
            ? "demonstrates must be a non-empty string"
            : null;
    if (malformed) {
      results.push({
        id: exemplar.id || `(invalid-${index})`,
        path: exemplar.path || "(missing)",
        ok: false,
        detail: malformed,
      });
      continue;
    }
    const safe = isRepoRelative(root, exemplar.path);
    const exemplarPath = safe ? path.join(root, exemplar.path) : null;
    const exemplarIsDirectory = exemplarPath && pathEntryExists(exemplarPath) &&
      fs.lstatSync(exemplarPath).isDirectory();
    const inventoryProblem = safe
      ? inventoryPathProblem(treeFiles, exemplar.path, {
          directory: exemplarIsDirectory,
        })
      : null;
    const nonRegular = safe
      ? (exemplarIsDirectory
          ? intersectingNonRegular(nonRegularPaths, exemplar.path)
          : coveringNonRegular(nonRegularPaths, exemplar.path))
      : null;
    const present = safe && !inventoryProblem && !nonRegular &&
      safeRepoPath(root, path.join(root, exemplar.path));
    results.push({
      id: exemplar.id,
      path: exemplar.path,
      ok: present,
      detail: present
        ? ""
        : nonRegular
          ? `path enters opaque Git mode ${nonRegular.mode} boundary: ${nonRegular.path}`
          : inventoryProblem
            ? inventoryProblem
          : safe
          ? "path does not exist"
          : "path must stay inside the repository",
    });
  }
  return results;
}

const ADAPTERS = [
  {
    file: ".cursor/rules/agentlintel.mdc",
    template: "adapters/cursor.mdc",
    regen: "agentlintel init --adapters --force",
  },
  {
    file: ".windsurf/rules/agentlintel.md",
    template: "adapters/windsurf.md",
    regen: "agentlintel init --adapters --force",
  },
  {
    file: ".github/instructions/agentlintel.instructions.md",
    template: "adapters/copilot.instructions.md",
    regen: "agentlintel init --adapters --force",
  },
  {
    file: ".agentlintel/hooks/verify-hook.sh",
    template: "hooks/verify-hook.sh",
    regen: "agentlintel init --hooks --force",
  },
];

const RETIRED_PATHS = [
  {
    file: ".agentlintel/hooks/pretooluse-hook.sh",
    detail: "retired ineffective hook remains - delete it and remove its Claude PreToolUse registration",
  },
  {
    file: ".agentlintel/skills",
    detail: "legacy skill directory remains - move project skills to .agents/skills/ and delete it",
  },
  {
    file: ".ai-governance",
    detail: "legacy v1 governance tree remains - complete migration, then delete it",
  },
  ...[
    "context.yaml",
    "architecture.guard.json",
    "cards",
    "index.yaml",
    "modes.yaml",
    "manifest.yaml",
    "slice.manifest.yaml",
    "packs.yaml",
    "features.yaml",
    "orchestrator-policy.yaml",
    "worker-registry.yaml",
    "thinking-modes.yaml",
    "model-routing.yaml",
    "repos.yaml",
    "boot.md",
    "kernel.md",
  ].map((file) => ({
    file: `.agentlintel/${file}`,
    detail: "legacy v1 governance artifact remains - complete migration, then delete it",
  })),
];

function checkAdapters(root, { nonRegularPaths = new Map() } = {}) {
  const templatesDir = path.join(__dirname, "..", "..", "templates");
  const results = [];

  for (const retired of RETIRED_PATHS)
    if (pathEntryExists(path.join(root, retired.file)))
      results.push({ file: retired.file, ok: false, detail: retired.detail });

  for (const adapter of ADAPTERS) {
    const generatedPath = path.join(root, adapter.file);
    if (!pathEntryExists(generatedPath)) continue;
    if (coveringNonRegular(nonRegularPaths, adapter.file) ||
        !safeRegularRepoFile(root, generatedPath)) {
      results.push({
        file: adapter.file,
        ok: false,
        detail: "generated adapter must be a regular repository file",
      });
      continue;
    }

    const templatePath = path.join(templatesDir, adapter.template);
    if (!fs.existsSync(templatePath)) {
      results.push({
        file: adapter.file,
        ok: true,
        warn: "generated file present but this CLI has no template to compare - upgrade or reinstall the CLI",
        detail: "",
      });
      continue;
    }

    const inSync =
      fs.readFileSync(generatedPath, "utf8").replace(/\r\n/g, "\n") ===
      fs.readFileSync(templatePath, "utf8").replace(/\r\n/g, "\n");
    results.push({
      file: adapter.file,
      ok: inSync,
      detail: inSync
        ? ""
        : `generated file drifted from its template - regenerate with: ${adapter.regen}`,
    });
  }

  return results;
}

function gitBlob(root, ref, filePath) {
  if (!validRef(ref)) return { status: "error", error: "unsafe baseline ref" };
  const spec = `${ref}:${filePath}`;
  const sizeOutput = gitOutput(root, ["cat-file", "-s", spec]);
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

function coveringNonRegular(nonRegularPaths, relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  for (const [entryPath, mode] of nonRegularPaths || [])
    if (normalized === entryPath || normalized.startsWith(`${entryPath}/`))
      return { path: entryPath, mode, exact: normalized === entryPath };
  return null;
}

function intersectingNonRegular(nonRegularPaths, relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  for (const [entryPath, mode] of nonRegularPaths || [])
    if (pathPrefixesOverlap(normalized, entryPath))
      return { path: entryPath, mode, exact: normalized === entryPath };
  return null;
}

function nonRegularFactProblem(nonRegularPaths, value, type) {
  if (!nonRegularPaths || !nonRegularPaths.size) return null;
  const normalizedValue = String(value || "").replace(/\\/g, "/");
  if (["glob_count", "frontmatter_byte_count_max"].includes(type)) {
    const prefix = literalGlobPrefix(normalizedValue);
    for (const [entryPath, mode] of nonRegularPaths)
      if (!prefix || pathPrefixesOverlap(prefix, entryPath))
        return `glob enters opaque Git mode ${mode} boundary: ${entryPath}`;
    return null;
  }
  const covered = coveringNonRegular(nonRegularPaths, normalizedValue);
  if (!covered) return null;
  if (type === "path_exists" && covered.mode === "160000" && covered.exact)
    return null;
  return `check path enters opaque Git mode ${covered.mode} boundary: ${covered.path}`;
}

function repositoryInventory(root) {
  const gitRoot = gitOutput(root, ["rev-parse", "--is-inside-work-tree"]);
  if (gitRoot == null || gitRoot.trim() !== "true")
    return {
      files: walk(root, { skipDirs: ALWAYS_SKIPPED_SEGMENTS }),
      error: null,
      source: "filesystem",
      tracked: null,
    };
  const topLevel = gitOutput(root, ["rev-parse", "--show-toplevel"]);
  if (topLevel == null || !topLevel.trim())
    return { files: [], error: "INVENTORY Git top-level could not be read", source: "git" };
  if (!sameDirectory(root, topLevel.trim()))
    return {
      files: [],
      error: `INVENTORY verification root must be the Git top-level: ${topLevel.trim()}`,
      source: "git",
    };
  const flags = gitOutput(root, ["ls-files", "-v", "-z"]);
  if (flags == null)
    return { files: [], error: "INVENTORY Git index flags could not be read", source: "git" };
  const sparse = flags.split("\0").filter((entry) => entry.startsWith("S "));
  if (sparse.length)
    return {
      files: [],
      error: `INVENTORY sparse checkout omits ${sparse.length} tracked path(s); full verification requires a complete checkout`,
      source: "git",
    };
  const hidden = flags.split("\0").filter((entry) => /^[a-z] /.test(entry));
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
  const trackedOutput = gitOutput(root, ["ls-files", "-z", "--cached"]);
  if (trackedOutput == null)
    return { files: [], error: "INVENTORY Git tracked-file inventory failed", source: "git" };
  return {
    files: [...new Set(output.split("\0").filter(Boolean))]
      .filter((file) => pathEntryExists(path.join(root, file)))
      .sort(),
    error: null,
    source: "git",
    tracked: new Set(trackedOutput.split("\0").filter(Boolean)),
  };
}

function isGovernanceArtifact(file) {
  if (file === "AGENTS.md" || file === "CLAUDE.md") return true;
  if (file.startsWith(".agentlintel/reports/")) return false;
  if (file.startsWith(".agentlintel/") || file.startsWith(".agents/skills/"))
    return true;
  return ADAPTERS.some((adapter) => adapter.file === file);
}

function untrackedGovernanceArtifacts(root, inventory) {
  if (inventory.source !== "git" || !inventory.tracked) return [];
  return walk(root)
    .filter(isGovernanceArtifact)
    .filter((file) => !inventory.tracked.has(file));
}

function normalizedText(value) {
  return String(value || "").replace(/\r\n/g, "\n");
}

function baselineAvailable(root, ref) {
  if (!validRef(ref)) return false;
  return gitOutput(root, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`]) != null;
}

function sortedArray(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])
    .map((entry) => JSON.stringify(entry))
    .sort();
}

function missingFromNew(oldValue, newValue) {
  const kept = new Set(sortedArray(newValue));
  return sortedArray(oldValue)
    .filter((entry) => !kept.has(entry))
    .map((entry) => JSON.parse(entry));
}

function addedToNew(oldValue, newValue) {
  const had = new Set(sortedArray(oldValue));
  return sortedArray(newValue)
    .filter((entry) => !had.has(entry))
    .map((entry) => JSON.parse(entry));
}

function severityRank(severity) {
  return (
    { off: 0, none: 0, info: 0, warn: 1, warning: 1, error: 2 }[
      String(severity || "error").toLowerCase()
    ] ?? 2
  );
}

function isWarningSeverity(severity) {
  return severityRank(severity) === 1;
}

function rulesById(rulesDoc) {
  return new Map(
    (rulesDoc && Array.isArray(rulesDoc.rules) ? rulesDoc.rules : [])
      .filter((rule) => rule && typeof rule === "object" && !Array.isArray(rule))
      .map(
        (rule) => [rule.id, rule],
      ),
  );
}

function objectMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function describeAllowedExpansion(oldRule, newRule) {
  const expansions = [];
  const oldAllowed = oldRule.allowed || {};
  const newAllowed = newRule.allowed || {};
  for (const [layerName, targets] of Object.entries(newAllowed))
    for (const added of addedToNew(oldAllowed[layerName] || [], targets || []))
      expansions.push(`${layerName} -> ${added}`);
  return expansions;
}

function detectRuleWeakening(oldDoc, newDoc) {
  const findings = [];
  const oldRules = rulesById(oldDoc);
  const newRules = rulesById(newDoc);

  for (const [id, oldRule] of oldRules) {
    const newRule = newRules.get(id);
    if (!newRule) {
      findings.push(`rule '${id}' was deleted`);
      continue;
    }

    if (oldRule.engine && newRule.engine && oldRule.engine !== newRule.engine)
      findings.push(
        `rule '${id}' changed engine from '${oldRule.engine}' to '${newRule.engine}'`,
      );
    if (severityRank(newRule.severity) < severityRank(oldRule.severity))
      findings.push(
        `rule '${id}' severity was downgraded from '${oldRule.severity || "error"}' to '${newRule.severity || "error"}'`,
      );
    if (newRule.must_match === false && oldRule.must_match !== false)
      findings.push(`rule '${id}' was made dormant with must_match: false`);
    else if (oldRule.must_match === true && newRule.must_match !== true)
      findings.push(`rule '${id}' no longer requires a non-empty scope`);

    for (const removed of missingFromNew(oldRule.forbidden || [], newRule.forbidden || []))
      findings.push(`rule '${id}' removed forbidden pattern ${JSON.stringify(removed)}`);
    for (const added of addedToNew(oldRule.excludes || [], newRule.excludes || []))
      findings.push(`rule '${id}' added exclude ${JSON.stringify(added)}`);
    for (const removed of missingFromNew(
      oldRule.applies_to || ["**/*"],
      newRule.applies_to || ["**/*"],
    ))
      findings.push(
        `rule '${id}' narrowed applies_to by removing ${JSON.stringify(removed)}`,
      );
    if (Array.isArray(oldRule.applies_to) && oldRule.applies_to.length &&
        !(Array.isArray(newRule.applies_to) && newRule.applies_to.length))
      findings.push(`rule '${id}' removed explicit scan scope for nonstandard file types`);
    if (oldRule.engine === "regex") {
      for (const removed of missingFromNew(oldRule.required || [], newRule.required || []))
        findings.push(`rule '${id}' removed required pattern ${JSON.stringify(removed)}`);
      if (!(oldRule.when || []).length && (newRule.when || []).length)
        findings.push(`rule '${id}' made required evidence conditional`);
      for (const removed of missingFromNew(oldRule.when || [], newRule.when || []))
        findings.push(`rule '${id}' removed required-evidence trigger ${JSON.stringify(removed)}`);
      if ((oldRule.match || "line") !== (newRule.match || "line"))
        findings.push(`rule '${id}' changed regex match mode from '${oldRule.match || "line"}' to '${newRule.match || "line"}'`);
      const oldFlags = new Set(String(oldRule.flags || ""));
      const newFlags = new Set(String(newRule.flags || ""));
      if (oldFlags.has("i") && !newFlags.has("i"))
        findings.push(`rule '${id}' removed regex flag 'i'`);
      if (!oldFlags.has("y") && newFlags.has("y"))
        findings.push(`rule '${id}' added sticky regex flag 'y'`);
      if (oldFlags.has("u") !== newFlags.has("u") ||
          oldFlags.has("v") !== newFlags.has("v"))
        findings.push(`rule '${id}' changed Unicode regex semantics`);
    }

    if (oldRule.engine === "error-codes")
      for (const added of addedToNew(oldRule.categories || [], newRule.categories || []))
        findings.push(`rule '${id}' added accepted error category ${JSON.stringify(added)}`);

    if (oldRule.engine === "exemptions") {
      for (const removed of missingFromNew(
        oldRule.required_fields || ["Reason", "Approver", "Expires", "Owner", "Decision"],
        newRule.required_fields || ["Reason", "Approver", "Expires", "Owner", "Decision"],
      ))
        findings.push(`rule '${id}' removed required exemption field ${JSON.stringify(removed)}`);
      const oldWindow = oldRule.within_lines ?? 5;
      const newWindow = newRule.within_lines ?? 5;
      if (newWindow > oldWindow)
        findings.push(`rule '${id}' expanded exemption window from ${oldWindow} to ${newWindow} lines`);
      if ((oldRule.marker || "AGENTLINTEL-EXEMPT") !==
          (newRule.marker || "AGENTLINTEL-EXEMPT"))
        findings.push(`rule '${id}' changed exemption marker`);
      for (const added of addedToNew(
        oldRule.applies_to || ["**/*"],
        newRule.applies_to || ["**/*"],
      ))
        findings.push(`rule '${id}' expanded exemption scope with ${JSON.stringify(added)}`);
      for (const removed of missingFromNew(oldRule.excludes || [], newRule.excludes || []))
        findings.push(`rule '${id}' removed exemption exclude ${JSON.stringify(removed)}`);
    }

    if (oldRule.engine === "external") {
      if (oldRule.run !== newRule.run)
        findings.push(`rule '${id}' changed external command`);
      const oldAdapter = oldRule.adapter || oldRule.format || "jsonl";
      const newAdapter = newRule.adapter || newRule.format || "jsonl";
      if (oldAdapter !== newAdapter)
        findings.push(`rule '${id}' changed external adapter`);
      if ((oldRule.scope || "tree") !== (newRule.scope || "tree"))
        findings.push(`rule '${id}' changed external scope`);
      for (const added of addedToNew(oldRule.ok_exits || [0, 1], newRule.ok_exits || [0, 1]))
        findings.push(`rule '${id}' added accepted external exit ${added}`);
      for (const removed of missingFromNew(oldRule.evidence || [], newRule.evidence || []))
        findings.push(`rule '${id}' removed external evidence ${JSON.stringify(removed)}`);
    }

    const oldAliases = objectMap(oldRule.aliases);
    const newAliases = objectMap(newRule.aliases);
    for (const [alias, target] of Object.entries(oldAliases))
      if (!(alias in newAliases) || newAliases[alias] !== target)
        findings.push(`rule '${id}' removed or changed alias '${alias}'`);
    for (const alias of Object.keys(newAliases))
      if (!(alias in oldAliases))
        findings.push(`rule '${id}' added potentially shadowing alias '${alias}'`);

    const oldLayers = new Map((Array.isArray(oldRule.layers) ? oldRule.layers : [])
      .filter((layer) => layer && typeof layer === "object" && !Array.isArray(layer))
      .map((layer) => [layer.name, layer]));
    const newLayers = new Map((Array.isArray(newRule.layers) ? newRule.layers : [])
      .filter((layer) => layer && typeof layer === "object" && !Array.isArray(layer))
      .map((layer) => [layer.name, layer]));
    const oldLayerOrder = [...oldLayers.keys()];
    const newLayerOrder = [...newLayers.keys()];
    if (JSON.stringify(oldLayerOrder) !== JSON.stringify(newLayerOrder))
      findings.push(`rule '${id}' changed layer order or membership`);
    for (const [layerName, oldLayer] of oldLayers) {
      const newLayer = newLayers.get(layerName);
      if (newLayer) {
        for (const removed of missingFromNew(oldLayer.path || [], newLayer.path || []))
          findings.push(
            `rule '${id}' narrowed layer '${layerName}' by removing ${JSON.stringify(removed)}`,
          );
        for (const added of addedToNew(oldLayer.path || [], newLayer.path || []))
          findings.push(
            `rule '${id}' changed layer '${layerName}' coverage by adding ${JSON.stringify(added)}`,
          );
      } else {
        findings.push(`rule '${id}' removed layer '${layerName}'`);
      }
    }
    for (const expansion of describeAllowedExpansion(oldRule, newRule))
      findings.push(`rule '${id}' expanded allowed dependency ${expansion}`);
  }

  if (![...oldRules.values()].some((rule) => rule.engine === "exemptions") &&
      [...newRules.values()].some((rule) => rule.engine === "exemptions"))
    findings.push("an exemptions rule was introduced and can suppress existing findings");

  return findings;
}

const ADR_FILE = /^ADR-(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function changedAdrFiles(files) {
  return (files || []).filter((file) =>
    /^\.agentlintel\/decisions\/ADR-\d+-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file),
  );
}

function newDecisionProblem(file, content) {
  const match = path.posix.basename(file).match(ADR_FILE);
  if (!match) return "new decision filename must be ADR-<number>-<slug>.md";
  const heading = new RegExp(`^#\\s+ADR-${match[1]}:\\s+\\S`, "m");
  if (!heading.test(content)) return `new decision needs a '# ADR-${match[1]}: <title>' heading`;
  const accepted = content.match(/^Accepted:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  if (!accepted)
    return "new decision needs an 'Accepted: YYYY-MM-DD' line";
  const [year, month, day] = accepted[1].split("-").map(Number);
  const date = new Date(`${accepted[1]}T00:00:00Z`);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day)
    return "new decision Accepted date is not a real calendar date";
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  if (date.getTime() > todayUtc)
    return "new decision Accepted date cannot be in the future";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const decisionLine = lines.findIndex((line) => line.trim() === "Decision:");
  let concreteDecision = false;
  if (decisionLine !== -1)
    for (const line of lines.slice(decisionLine + 1)) {
      const text = line.trim();
      if (!text) continue;
      if (text.startsWith("#") || /^[A-Za-z][A-Za-z -]*:\s*$/.test(text)) break;
      if (!/^(?:Accepted|Status):/i.test(text) && /[A-Za-z0-9]{3}/.test(text)) {
        concreteDecision = true;
        break;
      }
    }
  if (!concreteDecision)
    return "new decision needs a 'Decision:' section with a concrete decision";
  return null;
}

function authorizationDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    ? date
    : null;
}

function exactObjectKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function parseDecisionAuthorizations(file, content) {
  const fileMatch = path.posix.basename(file).match(ADR_FILE);
  const decision = fileMatch ? `ADR-${fileMatch[1]}` : null;
  const exemptions = [];
  const weakenings = [];
  const problems = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith("Authorizes-")) continue;
    const match = line.match(/^(Authorizes-(?:Exemption|Weakening)):\s*(\{.*\})$/);
    if (!match) {
      problems.push(`authorization on line ${index + 1} must be one-line JSON`);
      continue;
    }
    let value;
    try {
      value = JSON.parse(match[2]);
    } catch {
      problems.push(`authorization on line ${index + 1} is not valid JSON`);
      continue;
    }

    if (match[1] === "Authorizes-Exemption") {
      if (!exactObjectKeys(value, ["rule", "file", "expires"]) ||
          !validEntryId(value.rule) ||
          !isCanonicalRepoScope(value.file) || /[*?]/.test(value.file) ||
          !authorizationDate(value.expires)) {
        problems.push(
          `exemption authorization on line ${index + 1} needs exact rule, file, and real expires values`,
        );
        continue;
      }
      exemptions.push({ ...value, decision, source: file });
    } else {
      if (!exactObjectKeys(value, ["artifact", "finding"]) ||
          !isCanonicalRepoScope(value.artifact) || /[*?]/.test(value.artifact) ||
          typeof value.finding !== "string" || !value.finding.trim()) {
        problems.push(
          `weakening authorization on line ${index + 1} needs exact artifact and finding values`,
        );
        continue;
      }
      weakenings.push({ ...value, decision, source: file });
    }
  }

  return { exemptions, weakenings, problems };
}

function loadDecisionAuthorizations(root) {
  const exemptions = [];
  const weakenings = [];
  const problems = [];
  const decisionDir = path.join(root, KERNEL_DIR, "decisions");
  if (!safeRepoDirectory(root, decisionDir)) return { exemptions, weakenings, problems };
  for (const name of fs.readdirSync(decisionDir).sort()) {
    if (!ADR_FILE.test(name)) continue;
    const file = `${KERNEL_DIR}/decisions/${name}`;
    const absolute = path.join(root, file);
    if (!safeRegularRepoFile(root, absolute)) continue;
    const parsed = parseDecisionAuthorizations(file, fs.readFileSync(absolute, "utf8"));
    exemptions.push(...parsed.exemptions);
    weakenings.push(...parsed.weakenings);
    problems.push(...parsed.problems.map((message) => ({ file, message })));
  }
  return { exemptions, weakenings, problems };
}

function weakeningAuthorized(authorizations, artifact, finding) {
  return (authorizations || []).some(
    (authorization) => authorization.artifact === artifact &&
      authorization.finding === finding,
  );
}

function authorizeExemptionSpans(spans, authorizations) {
  const authorized = [];
  const violations = [];
  for (const span of spans || []) {
    const rules = span.rules.filter((rule) =>
      (authorizations || []).some((authorization) =>
        authorization.decision === span.decision &&
        authorization.rule === rule &&
        authorization.file === span.file &&
        authorization.expires === span.expires,
      ),
    );
    for (const rule of span.rules)
      if (!rules.includes(rule))
        violations.push({
          rule: "exemption.audited",
          file: span.file,
          line: span.fromLine,
          message: `Exemption is not exactly authorized by ${span.decision} for rule '${rule}', file '${span.file}', and expiry '${span.expires}'.`,
          severity: "error",
        });
    if (rules.length) authorized.push({ ...span, rules });
  }
  return { spans: authorized, violations };
}

function decisionNumber(file) {
  const match = path.posix.basename(file).match(ADR_FILE);
  return match ? match[1].replace(/^0+(?=\d)/, "") : null;
}

function checkDecisionIntegrity(
  root,
  { base = null, changed = null, nonRegularPaths = new Map() } = {},
) {
  const added = [];
  const violations = [];
  const numberCounts = new Map();
  const decisionDir = path.join(root, KERNEL_DIR, "decisions");
  const indexedBoundary = intersectingNonRegular(
    nonRegularPaths,
    `${KERNEL_DIR}/decisions`,
  );
  if (indexedBoundary) {
    violations.push({
      file: `${KERNEL_DIR}/decisions`,
      message: `decisions enter opaque Git mode ${indexedBoundary.mode} boundary: ${indexedBoundary.path}`,
    });
  } else if (pathEntryExists(decisionDir) && !safeRepoDirectory(root, decisionDir)) {
    violations.push({ file: `${KERNEL_DIR}/decisions`, message: "decisions must be a regular repository directory" });
  } else if (safeRepoDirectory(root, decisionDir)) {
    for (const entry of fs.readdirSync(decisionDir, { withFileTypes: true })) {
      const name = entry.name;
      if (!entry.isFile() || !ADR_FILE.test(name)) {
        violations.push({ file: `${KERNEL_DIR}/decisions/${name}`, message: "decisions may contain only regular ADR-<number>-<slug>.md files" });
        continue;
      }
      const number = decisionNumber(name);
      if (number) numberCounts.set(number, (numberCounts.get(number) || 0) + 1);
    }
    for (const [number, count] of numberCounts)
      if (count > 1)
        violations.push({
          file: `${KERNEL_DIR}/decisions`,
          message: `decision number ADR-${number} is already in use by ${count} files`,
        });
  }
  for (const problem of loadDecisionAuthorizations(root).problems)
    violations.push(problem);
  if (!changed || changed.files === null)
    return { status: `skipped (${changed ? changed.note : "no git"})`, added, violations };
  if (base && !changed.baseResolved)
    return { status: `skipped (base '${base}' unavailable)`, added, violations };

  const files = changedAdrFiles(changed.files);
  if (!files.length)
    return { status: violations.length ? `${violations.length} append-only violation(s)` : "unchanged", added, violations };

  const baselineRef = base || "HEAD";
  const hasBaseline = base ? true : baselineAvailable(root, baselineRef);

  for (const file of files) {
    const baseline = hasBaseline ? gitBlob(root, baselineRef, file) : { status: "absent" };
    const filePath = path.join(root, file);
    const exists = pathEntryExists(filePath);
    if (baseline.status === "error") {
      violations.push({ file, message: `baseline decision could not be checked: ${baseline.error}` });
      continue;
    }
    if (baseline.status === "absent") {
      if (exists) {
        if (!safeRegularRepoFile(root, filePath)) {
          violations.push({ file, message: "new decision must be a regular repository file" });
          continue;
        }
        const currentText = fs.readFileSync(filePath, "utf8");
        const problem = newDecisionProblem(file, currentText);
        if (problem) violations.push({ file, message: problem });
        else if ((numberCounts.get(decisionNumber(file)) || 0) === 1)
          added.push(file);
      }
      continue;
    }
    if (!exists) {
      violations.push({ file, message: "existing decision was deleted" });
      continue;
    }
    if (!safeRegularRepoFile(root, filePath)) {
      violations.push({ file, message: "existing decision must remain a regular repository file" });
      continue;
    }
    const currentText = fs.readFileSync(filePath, "utf8");
    if (normalizedText(currentText) !== normalizedText(baseline.content))
      violations.push({ file, message: "existing decision was modified" });
  }

  return {
    status: violations.length
      ? `${violations.length} append-only violation(s)`
      : `${added.length} new decision(s)`,
    added,
    violations,
  };
}

function validateRuleDecisionRefs(
  root,
  rules,
  { nonRegularPaths = new Map() } = {},
) {
  const decisionDir = path.join(root, KERNEL_DIR, "decisions");
  const available = new Set();
  if (!intersectingNonRegular(nonRegularPaths, `${KERNEL_DIR}/decisions`) &&
      safeRepoDirectory(root, decisionDir))
    for (const name of fs.readdirSync(decisionDir)) {
      const match = name.match(ADR_FILE);
      if (match) available.add(`ADR-${match[1]}`);
    }
  const problems = [];
  for (const rule of rules || [])
    for (const ref of rule.adr == null ? [] : Array.isArray(rule.adr) ? rule.adr : [rule.adr])
      if (!available.has(ref)) problems.push(`RULE-CONFIG [${rule.id}] adr '${ref}' has no decision file`);
  return problems;
}

function validateExternalEvidenceFiles(root, rules) {
  const problems = [];
  for (const rule of rules || []) {
    if (rule.engine !== "external") continue;
    for (const file of rule.evidence || [])
      if (!safeRegularRepoFile(root, path.join(root, file)))
        problems.push(
          `RULE-CONFIG [${rule.id}] external evidence '${file}' must be a regular repository file`,
        );
  }
  return problems;
}

function globContainedBy(glob, container) {
  if (glob === container || container === "**" || container === "**/*")
    return true;
  if (!/[?*[{]/.test(glob) && matchAny([container], glob)) return true;
  if (container.endsWith("/**")) {
    const prefix = container.slice(0, -2);
    return glob.startsWith(prefix);
  }
  return false;
}

function detectGuardWeakening(oldGuard, newGuard) {
  if (!newGuard) return ["guard.json was deleted"];
  const findings = [];
  const oldAllows = (Array.isArray(oldGuard && oldGuard.zones)
    ? oldGuard.zones
    : []).flatMap((zone) =>
      Array.isArray(zone && zone.allow)
        ? zone.allow.filter((glob) => typeof glob === "string")
        : [],
    );
  const newAllows = (Array.isArray(newGuard.zones) ? newGuard.zones : []).flatMap(
    (zone) => (Array.isArray(zone && zone.allow)
      ? zone.allow.filter((glob) => typeof glob === "string")
      : []),
  );
  for (const added of newAllows)
    if (!oldAllows.some((existing) => globContainedBy(added, existing)))
      findings.push(`guard added or changed allow glob '${added}' outside prior coverage`);

  const oldForbidden = Array.isArray(oldGuard && oldGuard.forbidden)
    ? oldGuard.forbidden.filter((glob) => typeof glob === "string")
    : [];
  const newForbidden = Array.isArray(newGuard.forbidden)
    ? newGuard.forbidden.filter((glob) => typeof glob === "string")
    : [];
  for (const removed of oldForbidden)
    if (!newForbidden.some((replacement) => globContainedBy(removed, replacement)))
      findings.push(`guard removed or narrowed forbidden glob '${removed}'`);
  return findings;
}

function factsById(doc) {
  return new Map(
    (doc && Array.isArray(doc.facts) ? doc.facts : [])
      .filter((fact) => fact && typeof fact === "object" && !Array.isArray(fact))
      .map((fact) => [fact.id, fact]),
  );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function factCheckWeakening(id, oldCheck, newCheck) {
  if (!oldCheck || !newCheck || typeof oldCheck !== "object" ||
      typeof newCheck !== "object")
    return `fact '${id}' changed its machine check`;
  if (oldCheck.type !== newCheck.type)
    return oldCheck.type === "pending" && newCheck.type !== "pending"
      ? null
      : `fact '${id}' changed check type from '${oldCheck.type}' to '${newCheck.type}'`;

  if (["path_exists", "file_absent"].includes(oldCheck.type))
    return oldCheck.path === newCheck.path
      ? null
      : `fact '${id}' changed checked path`;
  if (oldCheck.type === "file_contains")
    return oldCheck.path === newCheck.path && oldCheck.pattern === newCheck.pattern
      ? null
      : `fact '${id}' changed checked file or pattern`;
  if (["line_count_max", "byte_count_max"].includes(oldCheck.type)) {
    if (oldCheck.path !== newCheck.path) return `fact '${id}' changed checked path`;
    return newCheck.max <= oldCheck.max
      ? null
      : `fact '${id}' raised max from ${oldCheck.max} to ${newCheck.max}`;
  }
  if (oldCheck.type === "frontmatter_byte_count_max") {
    if (oldCheck.pattern !== newCheck.pattern) return `fact '${id}' changed checked glob`;
    return newCheck.max <= oldCheck.max
      ? null
      : `fact '${id}' raised max from ${oldCheck.max} to ${newCheck.max}`;
  }
  if (oldCheck.type === "glob_count") {
    if (oldCheck.pattern !== newCheck.pattern) return `fact '${id}' changed checked glob`;
    const oldMin = oldCheck.min ?? 0;
    const newMin = newCheck.min ?? 0;
    const oldMax = oldCheck.max ?? Infinity;
    const newMax = newCheck.max ?? Infinity;
    return newMin >= oldMin && newMax <= oldMax
      ? null
      : `fact '${id}' widened accepted glob count`;
  }
  if (oldCheck.type === "command")
    return oldCheck.run === newCheck.run &&
        (oldCheck.expect_exit ?? 0) === (newCheck.expect_exit ?? 0) &&
        (oldCheck.timeout_ms ?? 120000) === (newCheck.timeout_ms ?? 120000)
      ? null
      : `fact '${id}' changed its command contract`;
  if (oldCheck.type === "pending") return null;
  return sameValue(oldCheck, newCheck)
    ? null
    : `fact '${id}' changed its machine check`;
}

function detectFactWeakening(oldDoc, newDoc) {
  const findings = [];
  const oldFacts = factsById(oldDoc);
  const newFacts = factsById(newDoc);
  for (const [id, oldFact] of oldFacts) {
    const next = newFacts.get(id);
    if (!next) {
      findings.push(`fact '${id}' was deleted`);
      continue;
    }
    if (oldFact.claim !== next.claim)
      findings.push(`fact '${id}' changed its asserted claim`);
    const finding = factCheckWeakening(id, oldFact.check, next.check);
    if (finding) findings.push(finding);
  }
  return findings;
}

function checkYamlRatcheting(
  root,
  file,
  currentDoc,
  detect,
  { base = null, changed = null, authorizations = [] } = {},
) {
  if (!changed || changed.files === null)
    return { status: `skipped (${changed ? changed.note : "no git"})`, findings: [], ok: true };
  if (!changed.files.includes(file))
    return { status: "unchanged", findings: [], ok: true };
  if (base && !changed.baseResolved)
    return {
      status: `base '${base}' unavailable`,
      findings: [`baseline ${file} could not be checked because base '${base}' is unavailable`],
      ok: false,
    };
  const baselineRef = base || "HEAD";
  const baseline = gitBlob(root, baselineRef, file);
  if (baseline.status === "absent")
    return { status: "new contract", findings: [], ok: true };
  if (baseline.status === "error")
    return {
      status: `baseline could not be read: ${baseline.error}`,
      findings: [`baseline ${file} could not be checked: ${baseline.error}`],
      ok: false,
    };
  let baselineDoc;
  try {
    baselineDoc = YAML.parse(baseline.content, { maxAliasCount: 0 });
  } catch (error) {
    return {
      status: `baseline could not be parsed: ${error.message}`,
      findings: [`baseline ${file} could not be parsed`],
      ok: false,
    };
  }
  const findings = detect(baselineDoc, currentDoc);
  const unauthorized = findings.filter(
    (finding) => !weakeningAuthorized(authorizations, file, finding),
  );
  return {
    status: findings.length
      ? `${findings.length} potential weakening(s), ${unauthorized.length} unauthorized`
      : "checked, no weakening",
    findings,
    unauthorized,
    ok: unauthorized.length === 0,
  };
}

function checkFactRatcheting(root, factsDoc, options) {
  return checkYamlRatcheting(
    root,
    `${KERNEL_DIR}/facts.yaml`,
    factsDoc || { facts: [] },
    detectFactWeakening,
    options,
  );
}

function detectExemplarWeakening(oldDoc, newDoc) {
  const entries = (doc) => new Map(
    (doc && Array.isArray(doc.exemplars) ? doc.exemplars : [])
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => [entry.id, entry]),
  );
  const oldEntries = entries(oldDoc);
  const newEntries = entries(newDoc);
  const findings = [];
  for (const [id, oldEntry] of oldEntries) {
    const next = newEntries.get(id);
    if (!next) findings.push(`exemplar '${id}' was deleted`);
    else if (["shape", "path", "demonstrates"].some((key) => oldEntry[key] !== next[key]))
      findings.push(`exemplar '${id}' changed canonical evidence`);
  }
  return findings;
}

function checkExemplarRatcheting(root, exemplarsDoc, options) {
  const artifact = `${KERNEL_DIR}/exemplars.yaml`;
  const registry = checkYamlRatcheting(
    root,
    artifact,
    exemplarsDoc || { exemplars: [] },
    detectExemplarWeakening,
    options,
  );
  if (!options.changed || !Array.isArray(options.changed.files) ||
      options.changed.baseResolved === false)
    return registry;
  const baseline = gitBlob(root, options.base || "HEAD", artifact);
  if (baseline.status !== "read") return registry;
  let baselineDoc;
  try {
    baselineDoc = YAML.parse(baseline.content, { maxAliasCount: 0 });
  } catch {
    return registry;
  }
  const contentFindings = [];
  for (const exemplar of Array.isArray(baselineDoc.exemplars)
    ? baselineDoc.exemplars
    : []) {
    const exemplarPath = exemplar && typeof exemplar.path === "string"
      ? exemplar.path
      : null;
    if (!exemplarPath) continue;
    for (const changedFile of options.changed.files)
      if (changedFile === exemplarPath || changedFile.startsWith(`${exemplarPath}/`))
        contentFindings.push(
          `exemplar '${exemplar.id}' implementation changed at '${changedFile}'`,
        );
  }
  const findings = [...new Set([...(registry.findings || []), ...contentFindings])];
  const unauthorized = findings.filter((finding) =>
    !weakeningAuthorized(options.authorizations, artifact, finding));
  return {
    status: findings.length
      ? `${findings.length} potential weakening(s), ${unauthorized.length} unauthorized`
      : registry.status,
    findings,
    unauthorized,
    ok: unauthorized.length === 0,
  };
}

function checkGuardRatcheting(
  root,
  guard,
  { base = null, changed = null, authorizations = [] } = {},
) {
  const guardFile = `${KERNEL_DIR}/guard.json`;
  if (!changed || changed.files === null)
    return { status: `skipped (${changed ? changed.note : "no git"})`, findings: [], ok: true };
  if (!changed.files.includes(guardFile))
    return { status: "unchanged", findings: [], ok: true };
  if (base && !changed.baseResolved)
    return {
      status: `base '${base}' unavailable`,
      findings: [`baseline guard could not be checked because base '${base}' is unavailable`],
      ok: false,
    };

  const baselineRef = base || "HEAD";
  if (!base && !baselineAvailable(root, baselineRef))
    return { status: "new guard", findings: [], ok: true };
  const baseline = gitBlob(root, baselineRef, guardFile);
  if (baseline.status === "absent")
    return { status: "new guard", findings: [], ok: true };
  if (baseline.status === "error")
    return {
      status: `baseline guard could not be read: ${baseline.error}`,
      findings: [`baseline guard could not be checked: ${baseline.error}`],
      ok: false,
    };

  let baselineGuard;
  try {
    baselineGuard = JSON.parse(baseline.content);
  } catch (error) {
    return {
      status: `baseline guard could not be parsed: ${error.message}`,
      findings: ["baseline guard could not be parsed"],
      ok: false,
    };
  }
  const findings = detectGuardWeakening(baselineGuard, guard);
  const unauthorized = findings.filter((finding) =>
    !weakeningAuthorized(authorizations, guardFile, finding));
  return {
    status: findings.length
      ? `${findings.length} potential weakening(s)`
      : "checked, no weakening",
    findings,
    unauthorized,
    ok: unauthorized.length === 0,
  };
}

function checkRuleRatcheting(
  root,
  rulesDoc,
  { base = null, changed = null, authorizations = [] } = {},
) {
  if (!changed || changed.files === null)
    return {
      status: `skipped (${changed ? changed.note : "no git"})`,
      findings: [],
      ok: true,
    };
  if (base && !changed.baseResolved)
    return {
      status: `base '${base}' unavailable`,
      findings: [`baseline rules could not be checked because base '${base}' is unavailable`],
      ok: false,
    };

  const baselineRef = base || "HEAD";
  const baseline = gitBlob(root, baselineRef, `${KERNEL_DIR}/rules.yaml`);
  if (baseline.status === "absent")
    return { status: `no baseline rules at ${baselineRef}`, findings: [], ok: true };
  if (baseline.status === "error")
    return {
      status: `baseline rules could not be read: ${baseline.error}`,
      findings: [`baseline rules could not be checked: ${baseline.error}`],
      ok: false,
    };

  let baselineRules;
  try {
    baselineRules = YAML.parse(baseline.content, { maxAliasCount: 0 });
  } catch (error) {
    return {
      status: `baseline rules at ${baselineRef} could not be parsed: ${error.message}`,
      findings: ["baseline rules could not be parsed"],
      ok: false,
    };
  }

  const findings = detectRuleWeakening(baselineRules, rulesDoc || { rules: [] });
  for (const rule of rulesById(baselineRules).values())
    if (rule.engine === "external")
      for (const evidence of rule.evidence || [])
        if (changed.files.includes(evidence))
          findings.push(`rule '${rule.id}' external evidence changed at '${evidence}'`);
  const artifact = `${KERNEL_DIR}/rules.yaml`;
  const unauthorized = findings.filter((finding) =>
    !weakeningAuthorized(authorizations, artifact, finding));
  return {
    status: findings.length
      ? `checked ${findings.length} rule-set weakening(s)`
      : "checked, no weakening",
    findings,
    unauthorized,
    ok: unauthorized.length === 0,
  };
}

function ruleReference(violation) {
  if (!violation.adr) return "";
  const refs = Array.isArray(violation.adr) ? violation.adr : [violation.adr];
  return ` [${refs.join(",")}]`;
}

function ruleViolationMessage(violation) {
  return `RULE [${violation.rule}]${ruleReference(violation)} ${violation.file}:${violation.line} ${violation.message}`;
}

function verify(root, options = {}) {
  const trackedNonRegular = trackedNonRegularFiles(root);
  const nonRegularPaths = new Map(
    trackedNonRegular.map((entry) => [entry.file, entry.mode]),
  );
  const kernel = loadKernel(root, { nonRegularPaths });
  const requestedBase = resolveBase(options.base);
  const baseResolution = resolveCommitBase(root, requestedBase);
  const base = baseResolution.commit || requestedBase;
  const diffMode = Boolean(options.diff);
  // Facts and guard scope describe the current tree even during --diff and
  // --bail. Build one inventory so every mode sees the same evidence.
  const inventory = repositoryInventory(root);
  const untrackedGovernance = untrackedGovernanceArtifacts(root, inventory);
  const hasDynamicChecks = Boolean(
    kernel.facts && Array.isArray(kernel.facts.facts) &&
      kernel.facts.facts.some((fact) => fact && fact.check && fact.check.type === "command") ||
    !diffMode && kernel.rules && Array.isArray(kernel.rules.rules) &&
      kernel.rules.rules.some((rule) => rule && rule.engine === "external"),
  );
  const runRequested = options.run !== false && !inventory.error &&
    untrackedGovernance.length === 0;
  const dynamicStateBefore = runRequested && hasDynamicChecks && inventory.source === "git"
    ? gitStateFingerprint(root) : null;
  const dynamicUnavailable = runRequested && hasDynamicChecks &&
    (inventory.source !== "git" || !dynamicStateBefore);
  const canRun = runRequested && !dynamicUnavailable;

  let bailFacts = null;
  if (options.bail && kernel.facts) {
    const facts = verifyFacts(root, kernel.facts, {
      run: canRun,
      treeFiles: inventory.files,
      nonRegularPaths,
    });
    bailFacts = facts;
    const stale = facts.filter((fact) => !fact.ok && !fact.pending);
    if (stale.length || inventory.error) {
      const staleErrors = stale.map(
        (fact) => `STALE FACT [${fact.id}] ${fact.claim} -> ${fact.detail}`,
      );
      if (inventory.error) staleErrors.push(inventory.error);
      const advisory = options.mode === "warn";
      const bail = {
        root: path.resolve(root),
        mode: "bail",
        kernel_present: true,
        facts,
        rule_violations: [],
        external_engines: [],
        fixtures: [],
        guard: { status: "skipped (--bail)", violations: [], warnings: [] },
        fact_ratchet: { status: "skipped (--bail)", findings: [], ok: true },
        exemplar_ratchet: { status: "skipped (--bail)", findings: [], ok: true },
        ratchet: { status: "skipped (--bail)", findings: [], ok: true },
        guard_ratchet: { status: "skipped (--bail)", findings: [], ok: true },
        decisions: { status: "skipped (--bail)", added: [], violations: [] },
        exemplars: [],
        adapters: [],
        dormant_rules: [],
        exempted_count: 0,
        errors: advisory ? [] : staleErrors,
        warnings: advisory ? staleErrors.map((error) => `ADVISORY ${error}`) : [],
        ok: advisory,
      };
      if (advisory) bail.advisory_mode = "warn";
      return bail;
    }
  }

  const ruleSet = kernel.rules ? preparedRuleSet(kernel.rules) : null;
  if (ruleSet)
    ruleSet.configErrors.push(...validateRuleDecisionRefs(
      root,
      ruleSet.all,
      { nonRegularPaths },
    ));
  if (ruleSet)
    ruleSet.configErrors.push(...validateExternalEvidenceFiles(root, ruleSet.all));
  const ruleIndex = ruleSet
    ? new Map(ruleSet.all.map((rule) => [rule.id, rule]))
    : new Map();
  const changed = baseResolution.error
    ? {
        ...changedFiles(root, null),
        note: baseResolution.error,
        baseResolved: false,
      }
    : changedFiles(root, base);
  const decisions = checkDecisionIntegrity(root, {
    base,
    changed,
    nonRegularPaths,
  });
  const decisionAuthorizations = loadDecisionAuthorizations(root);
  const addedDecisions = new Set(decisions.added);
  const weakeningAuthorizations = decisionAuthorizations.weakenings.filter(
    (authorization) => addedDecisions.has(authorization.source),
  );

  let scanFiles;
  const treeFiles = inventory.files.filter((file) => !isSkippedPrefix(file));
  const guardTreeFiles = inventory.files;
  if (diffMode) {
    scanFiles = (changed.files || []).filter((file) =>
      pathEntryExists(path.join(root, file)),
    );
  } else {
    scanFiles = treeFiles;
  }

  const { violations: fileViolations, spans, ruleFileCounts } = kernel.rules
      ? runRulesOnFiles(root, kernel.rules, scanFiles, {
          rules: ruleSet.fileRules,
          nonRegularPaths,
          partial: diffMode,
          changed,
          base,
        })
    : { violations: [], spans: [], ruleFileCounts: new Map() };
  const external =
    kernel.rules && !diffMode
      ? runExternalRules(root, kernel.rules, {
          run: canRun,
          rules: ruleSet.externalRules,
        })
      : {
          violations: [],
          statuses: diffMode && ruleSet
            ? ruleSet.externalRules.map((rule) => ({
                rule: rule.id,
                status: "skipped (--diff)",
              }))
            : [],
        };

  const authorizedExemptions = authorizeExemptionSpans(
    spans,
    decisionAuthorizations.exemptions,
  );
  const allViolations = [
    ...fileViolations,
    ...external.violations,
    ...authorizedExemptions.violations,
  ];
  applySuppression(
    allViolations,
    authorizedExemptions.spans,
    new Set(ruleSet ? ruleSet.all.filter((rule) => rule.engine === "exemptions").map((rule) => rule.id) : []),
  );

  const result = {
    root: path.resolve(root),
    mode: diffMode ? "diff" : "tree",
    kernel_present: Boolean(kernel.facts || kernel.rules),
    facts:
      bailFacts ||
      (kernel.facts
        ? verifyFacts(root, kernel.facts, {
            run: canRun,
            treeFiles: inventory.files,
            nonRegularPaths,
          })
        : []),
    rule_violations: allViolations,
    external_engines: external.statuses,
    fixtures:
      kernel.rules && !options.skipFixtures
        ? runFixtures(root, kernel.rules, {
            rules: ruleSet.all,
            nonRegularPaths,
          })
        : [],
    guard: checkGuard(root, kernel.guard, { base, treeFiles: guardTreeFiles, changed }),
    fact_ratchet: checkFactRatcheting(root, kernel.facts, {
      base,
      changed,
      authorizations: weakeningAuthorizations,
    }),
    exemplar_ratchet: checkExemplarRatcheting(root, kernel.exemplars, {
      base,
      changed,
      authorizations: weakeningAuthorizations,
    }),
    ratchet: checkRuleRatcheting(root, kernel.rules, {
      base,
      changed,
      authorizations: weakeningAuthorizations,
    }),
    guard_ratchet: checkGuardRatcheting(root, kernel.guard, {
      base,
      changed,
      authorizations: weakeningAuthorizations,
    }),
    decisions,
    exemplars: kernel.exemplars
      ? checkExemplars(root, kernel.exemplars, {
          nonRegularPaths,
          treeFiles: inventory.files,
        })
      : [],
    adapters: checkAdapters(root, { nonRegularPaths }),
    kernel_schema: kernel.schemaErrors || [],
    rule_config: ruleSet ? ruleSet.configErrors : [],
    tracked_nonregular: trackedNonRegular,
  };

  const errors = [...result.kernel_schema, ...result.rule_config];
  const warnings = [];

  if (dynamicUnavailable) {
    errors.push(
      "DYNAMIC-INTEGRITY executable checks require a readable committed Git worktree snapshot; no command was run",
    );
  } else if (canRun && hasDynamicChecks) {
    const dynamicStateAfter = gitStateFingerprint(root);
    if (!dynamicStateBefore || !dynamicStateAfter)
      errors.push(
        "DYNAMIC-INTEGRITY executable checks require a readable committed Git worktree snapshot",
      );
    else if (dynamicStateBefore !== dynamicStateAfter)
      errors.push(
        "DYNAMIC-INTEGRITY command facts or external rules changed versionable repository state during verification",
      );
  }

  if (baseResolution.error) errors.push(`BASE ${baseResolution.error}`);
  if (inventory.error) errors.push(inventory.error);
  for (const file of untrackedGovernance)
    warnings.push(
      `GOVERNANCE-UNTRACKED [${file}] verification inputs must be committed to participate in diffs and ratchets`,
    );
  if (!base && inventory.source === "git")
    warnings.push("RATCHET-BASE no comparison base was provided; committed contract changes were not compared");
  if (diffMode)
    warnings.push("DIFF-SCOPE only changed files were scanned; run a full tree gate before merge");
  if (kernel.rules && options.skipFixtures)
    warnings.push("FIXTURES-SKIPPED conformance evidence was not checked");

  if (!result.kernel_present)
    errors.push(
      "No .agentlintel kernel found (facts.yaml / rules.yaml). Run: agentlintel init",
    );

  if (!kernel.facts)
    warnings.push("FACTS-ABSENT .agentlintel/facts.yaml is missing");
  if (!kernel.rules)
    warnings.push("RULES-ABSENT .agentlintel/rules.yaml is missing");
  if (!kernel.exemplars)
    warnings.push("EXEMPLARS-ABSENT .agentlintel/exemplars.yaml is missing");

  if (kernel.facts && result.facts.length === 0)
    warnings.push(
      "FACTS-EMPTY facts.yaml declares no checked project facts - the facts contract enforces nothing",
    );
  if (kernel.exemplars && result.exemplars.length === 0)
    warnings.push(
      "EXEMPLARS-EMPTY exemplars.yaml registers no canonical implementation",
    );

  for (const fact of result.facts) {
    if (fact.skipped)
      warnings.push(`NO-RUN FACT [${fact.id}] ${fact.claim} -> ${fact.detail}`);
    else if (fact.pending)
      warnings.push(`PENDING FACT [${fact.id}] ${fact.claim} -> ${fact.detail}`);
    else if (!fact.ok)
      errors.push(`STALE FACT [${fact.id}] ${fact.claim} -> ${fact.detail}`);
  }

  for (const violation of result.rule_violations) {
    if (violation.exempted) continue;
    (isWarningSeverity(violation.severity) ? warnings : errors).push(
      ruleViolationMessage(violation),
    );
  }

  for (const engine of result.external_engines)
    if (engine.status && engine.status.startsWith("skipped"))
      warnings.push(`NO-RUN RULE [${engine.rule}] ${engine.status}`);

  for (const rule of (ruleSet && ruleSet.all) || [])
    if (rule.engine === "layers")
      for (const problem of validateLayersRule(rule))
        errors.push(`RULE-CONFIG [${rule.id}] ${problem}`);

  // Rules whose scope matches nothing cannot fire. Unset must_match warns
  // (fails --strict), true fails, false is a declared fixture-carrier and is
  // reported as dormant instead of silently passing.
  const dormantRules = [];
  if (!diffMode && kernel.rules) {
    for (const [ruleId, fileCount] of ruleFileCounts) {
      if (fileCount > 0) continue;
      const rule = ruleIndex.get(ruleId);
      if (rule && rule.must_match === false) {
        dormantRules.push(ruleId);
        continue;
      }
      const message =
        rule && rule.engine === "layers"
          ? `RULE-SCOPE [${ruleId}] no file lands in any declared layer - the rule cannot fire`
          : `RULE-SCOPE [${ruleId}] applies_to matched 0 files - the rule cannot fire`;
      (rule && rule.must_match === true ? errors : warnings).push(message);
    }
    for (const rule of ruleSet.all)
      if (rule.engine === "layers" && rule.must_match !== false && treeFiles)
        for (const layer of rule.layers || [])
          if (!treeFiles.some((file) => layerOfPath([layer], file))) {
            const message = `LAYER-SCOPE [${rule.id}] layer '${layer.name}' matches no files in the tree`;
            (rule.must_match === true ? errors : warnings).push(message);
          }
  }
  result.dormant_rules = dormantRules;

  for (const fixture of result.fixtures)
    if (!fixture.ok) errors.push(`FIXTURE [${fixture.rule}/${fixture.case}] ${fixture.detail}`);

  if (kernel.rules && !options.skipFixtures) {
    const conformanceDir = path.join(root, KERNEL_DIR, "conformance");
    if (pathEntryExists(conformanceDir) && !safeRepoDirectory(root, conformanceDir)) {
      errors.push("FIXTURE [.agentlintel/conformance] must be a regular in-repository directory");
    } else if (safeRepoDirectory(root, conformanceDir)) {
      const ruleIds = new Set(
        (Array.isArray(kernel.rules.rules) ? kernel.rules.rules : []).map(
          (rule) => rule && rule.id,
        ),
      );
      for (const entry of fs.readdirSync(conformanceDir, { withFileTypes: true }))
        if (entry.isDirectory() && !ruleIds.has(entry.name))
          warnings.push(
            `ORPHAN-FIXTURE [${entry.name}] fixtures exist but no such rule - delete the directory or restore the rule`,
          );
    }
  }

  for (const violation of result.guard.violations)
    errors.push(`GUARD [${violation.rule}] ${violation.file} ${violation.message}`);
  warnings.push(...(result.guard.warnings || []));

  for (const violation of result.decisions.violations)
    errors.push(
      `DECISION [append-only] ${violation.file} ${violation.message}; add a new superseding ADR instead`,
    );

  if (result.ratchet && !result.ratchet.ok) {
    const remedy = "add an exact Authorizes-Weakening record to a new ADR in the same diff";
    for (const finding of result.ratchet.unauthorized || result.ratchet.findings)
      errors.push(`RATCHET [rules.yaml] ${finding}; ${remedy}`);
  }
  if (result.fact_ratchet && !result.fact_ratchet.ok) {
    const remedy = "add an exact Authorizes-Weakening record to a new ADR in the same diff";
    for (const finding of result.fact_ratchet.unauthorized || result.fact_ratchet.findings)
      errors.push(`RATCHET [facts.yaml] ${finding}; ${remedy}`);
  }
  if (result.exemplar_ratchet && !result.exemplar_ratchet.ok) {
    const remedy = "add an exact Authorizes-Weakening record to a new ADR in the same diff";
    for (const finding of result.exemplar_ratchet.unauthorized || result.exemplar_ratchet.findings)
      errors.push(`RATCHET [exemplars.yaml] ${finding}; ${remedy}`);
  }
  if (result.guard_ratchet && !result.guard_ratchet.ok)
    for (const finding of result.guard_ratchet.unauthorized || result.guard_ratchet.findings)
      errors.push(
        `RATCHET [guard.json] ${finding}; add an exact Authorizes-Weakening record to a new ADR in the same diff`,
      );

  for (const exemplar of result.exemplars)
    if (!exemplar.ok)
      errors.push(`EXEMPLAR [${exemplar.id}] ${exemplar.path} ${exemplar.detail}`);

  for (const adapter of result.adapters) {
    if (adapter.ok) {
      if (adapter.warn) warnings.push(`ADAPTER [${adapter.file}] ${adapter.warn}`);
    } else {
      errors.push(`ADAPTER [${adapter.file}] ${adapter.detail}`);
    }
  }

  result.exempted_count = result.rule_violations.filter(
    (violation) => violation.exempted,
  ).length;

  if (options.mode === "warn") {
    result.advisory_mode = "warn";
    warnings.push(...errors.map((error) => `ADVISORY ${error}`));
    errors.length = 0;
  }

  result.errors = errors;
  result.warnings = warnings;
  result.ok =
    errors.length === 0 &&
    (options.mode === "warn" || !options.strict || warnings.length === 0);
  return result;
}

module.exports = {
  verify,
  loadKernel,
  verifyFacts,
  runRulesOnFiles,
  ruleApplies,
  preparedRuleSet,
  runExternalRules,
  applySuppression,
  runFixtures,
  checkGuard,
  checkExemplars,
  checkAdapters,
  checkRuleRatcheting,
  detectRuleWeakening,
  resolveBase,
};
