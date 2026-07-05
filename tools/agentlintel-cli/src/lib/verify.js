// SPDX-License-Identifier: FSL-1.1-ALv2
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const YAML = require("yaml");
const { readYaml, readJson, walk, matchAny } = require("./io");
const {
  runRule,
  prepareRule,
  collectExemptionSpans,
  layerOfPath,
  validateLayersRule,
} = require("./engines");

const KERNEL_DIR = ".agentlintel";
const SKIP_PREFIXES = [`${KERNEL_DIR}/conformance`, `${KERNEL_DIR}/reports`];

function kernelShape(doc, label, collection) {
  const problems = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    problems.push(`KERNEL-SCHEMA [${label}] expected YAML object`);
  } else {
    if (doc.version !== 2)
      problems.push(`KERNEL-SCHEMA [${label}] version must be 2`);
    if (!Array.isArray(doc[collection]))
      problems.push(`KERNEL-SCHEMA [${label}] ${collection} must be an array`);
  }
  return problems;
}

function loadKernel(root) {
  const kernelDir = path.join(root, KERNEL_DIR);
  const kernel = {
    facts: null,
    rules: null,
    guard: null,
    exemplars: null,
    schemaErrors: [],
  };

  const factsPath = path.join(kernelDir, "facts.yaml");
  const rulesPath = path.join(kernelDir, "rules.yaml");
  const guardPath = path.join(kernelDir, "guard.json");
  const exemplarsPath = path.join(kernelDir, "exemplars.yaml");

  if (fs.existsSync(factsPath)) {
    kernel.facts = readYaml(factsPath);
    kernel.schemaErrors.push(
      ...kernelShape(kernel.facts, `${KERNEL_DIR}/facts.yaml`, "facts"),
    );
  }
  if (fs.existsSync(rulesPath)) {
    kernel.rules = readYaml(rulesPath);
    kernel.schemaErrors.push(
      ...kernelShape(kernel.rules, `${KERNEL_DIR}/rules.yaml`, "rules"),
    );
  }
  if (fs.existsSync(guardPath)) kernel.guard = readJson(guardPath);
  if (fs.existsSync(exemplarsPath)) {
    kernel.exemplars = readYaml(exemplarsPath);
    kernel.schemaErrors.push(
      ...kernelShape(
        kernel.exemplars,
        `${KERNEL_DIR}/exemplars.yaml`,
        "exemplars",
      ),
    );
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
  return walk(walkRoot, { skipPrefixes: baseDir ? [] : SKIP_PREFIXES })
    .map((file) => (baseDir ? `${baseDir}/${file}` : file))
    .filter((file) => !isSkippedPrefix(file));
}

function verifyFacts(root, factsDoc, { run = true, treeFiles = null } = {}) {
  const results = [];
  const facts = Array.isArray(factsDoc && factsDoc.facts) ? factsDoc.facts : [];

  for (const fact of facts) {
    const check = fact.check || {};
    let ok = false;
    let pending = false;
    let detail = "";
    let skipped = false;

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
          // wc -l semantics: a trailing newline does not start a new line.
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
          const byteCount = fs.statSync(filePath).size;
          ok = byteCount <= check.max;
          detail = ok
            ? ""
            : `${check.path} is ${byteCount} bytes, budget is ${check.max}`;
        } else {
          detail = `missing: ${check.path}`;
        }
      } else if (check.type === "glob_count") {
        const count = filesForGlob(root, check.pattern, treeFiles).filter(
          (file) => matchAny([check.pattern], file),
        ).length;
        const min = check.min ?? 0;
        const max = check.max ?? Infinity;
        ok = count >= min && count <= max;
        detail = ok
          ? ""
          : `glob '${check.pattern}' matched ${count} file(s), expected ${check.min != null ? `>= ${check.min}` : ""}${check.min != null && check.max != null ? " and " : ""}${check.max != null ? `<= ${check.max}` : ""}`;
      } else if (check.type === "command") {
        if (run) {
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
        detail =
          check.note ||
          "no machine check yet - write one or move the claim to an ADR";
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
  /\.(ts|tsx|js|jsx|mts|cts|cs|py|go|java|rb|php|rs|kt|swift|c|cc|cpp|cxx|h|hh|hpp|hxx|scala|ex|exs|sql|yaml|yml|json|md|sh|ps1)$/i;
const MAX_SCAN_BYTES = 2097152;

function ruleApplies(rule, filePath) {
  const appliesTo =
    rule._appliesTo ||
    (rule.applies_to && rule.applies_to.length ? rule.applies_to : ["**/*"]);
  if (!matchAny(appliesTo, filePath)) return false;
  const excludes = rule._excludes || rule.excludes;
  return !excludes || !matchAny(excludes, filePath);
}

function preparedRuleSet(rulesDoc) {
  const all = (
    rulesDoc && Array.isArray(rulesDoc.rules) ? rulesDoc.rules : []
  ).map(prepareRule);
  return {
    all,
    fileRules: all.filter((rule) => rule.engine !== "external"),
    externalRules: all.filter((rule) => rule.engine === "external"),
  };
}

function runRulesOnFiles(root, rulesDoc, files, options = {}) {
  const violations = [];
  const spans = [];
  const rules = options.rules || preparedRuleSet(rulesDoc).fileRules;
  const exemptionRule = rules.find((rule) => rule.engine === "exemptions");
  const explicitGlobs = rules
    .filter((rule) => rule.applies_to && rule.applies_to.length)
    .flatMap((rule) => rule._appliesTo);
  const ruleFileCounts = new Map(rules.map((rule) => [rule.id, 0]));

  if (!rules.length) return { violations, spans, ruleFileCounts };

  for (const filePath of files) {
    if (!TEXT_EXT.test(filePath) && !matchAny(explicitGlobs, filePath))
      continue;
    if (/(^|\/)\.agentlintel\/conformance\//.test(filePath)) continue;

    const applicable = rules.filter((rule) => ruleApplies(rule, filePath));
    if (!applicable.length) continue;

    let content;
    try {
      if (fs.statSync(path.join(root, filePath)).size > MAX_SCAN_BYTES)
        continue;
      content = fs.readFileSync(path.join(root, filePath), "utf8");
    } catch {
      continue;
    }

    for (const rule of applicable) {
      // A layers rule only "covers" a file that lands in a declared layer.
      if (rule.engine !== "layers" || layerOfPath(rule.layers || [], filePath))
        ruleFileCounts.set(rule.id, ruleFileCounts.get(rule.id) + 1);
      violations.push(...runRule(rule, filePath, content, { skipApplies: true }));
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

    const spawned = spawnSync(rule.run, {
      cwd: root,
      shell: true,
      timeout: rule.timeout_ms || 300000,
      encoding: "utf8",
      maxBuffer: 16777216,
    });
    const parsed = parseExternalOutput(rule, spawned.stdout || "", {
      status: spawned.status,
      stderr: spawned.stderr || "",
    });
    const okExits = rule.ok_exits || [0, 1];

    // Fail closed: a crash, timeout, unexpected exit code, or a non-zero exit
    // that produced no parseable findings is an engine failure, not a pass.
    if (
      spawned.error ||
      spawned.status === null ||
      !okExits.includes(spawned.status) ||
      (spawned.status !== 0 && parsed.length === 0)
    ) {
      const stderrSummary = (spawned.stderr || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 2)
        .join(" | ");
      const reason = spawned.error
        ? String(spawned.error)
        : spawned.status === null
          ? "timeout"
          : `exit ${spawned.status}${parsed.length === 0 ? ", no violations parsed" : ""}`;
      statuses.push({
        rule: rule.id,
        status: `engine failed: ${reason}${stderrSummary ? ` - ${stderrSummary}` : ""}`,
      });
      violations.push({
        rule: rule.id,
        file: "(engine)",
        line: 0,
        message: `external engine did not run cleanly (${reason}): ${rule.run}`,
        severity: rule.severity,
      });
      continue;
    }

    violations.push(...parsed);
    statuses.push({ rule: rule.id, status: "ran" });
  }

  return { violations, statuses };
}

function parseExternalOutput(rule, stdout, meta = {}) {
  const adapter = rule.adapter || rule.format || "jsonl";
  if (adapter === "dependency-cruiser")
    return parseDependencyCruiserOutput(rule, stdout);
  if (adapter === "dotnet-test") return parseDotnetTestOutput(rule, stdout, meta);
  if (adapter === "command-status" || adapter === "status")
    return parseCommandStatusOutput(rule, stdout, meta);

  const violations = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry.file)
        violations.push({
          rule: rule.id,
          file: String(entry.file).replace(/\\/g, "/"),
          line: entry.line ?? 0,
          message: entry.message || rule.message || "external engine violation",
          severity: rule.severity,
        });
    } catch {}
  }
  return violations;
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

function depCruiserViolation(rule, file, line, ruleName, from, to, comment, severity) {
  const edge = from && to ? `${from} -> ${to}` : from || to || file;
  const message = [ruleName || rule.message || "dependency-cruiser violation", edge, comment]
    .filter(Boolean)
    .join(": ");
  return {
    rule: rule.id,
    file: file || from || "(dependency-cruiser)",
    line: line || 0,
    message,
    severity: severity || rule.severity,
  };
}

function parseDependencyCruiserOutput(rule, stdout) {
  const doc = jsonFromOutput(stdout);
  if (!doc) return [];

  const violations = [];
  const reported = [
    ...((doc.summary && doc.summary.violations) || []),
    ...(doc.violations || []),
    ...((doc.validation && doc.validation.violations) || []),
  ];

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
        entry.severity || (entry.rule && entry.rule.severity),
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
            ruleEntry.severity,
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
          ruleEntry.severity,
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

function applySuppression(violations, spans) {
  for (const violation of violations) {
    if (violation.rule === "exemption.audited") continue;
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

function runFixtures(root, rulesDoc, options = {}) {
  const results = [];
  const rules = options.rules || preparedRuleSet(rulesDoc).all;

  for (const rule of rules) {
    const casesDir = path.join(root, KERNEL_DIR, "conformance", rule.id, "cases");
    if (!fs.existsSync(casesDir)) {
      results.push({
        rule: rule.id,
        case: "(none)",
        ok: false,
        detail: "LAW VIOLATION: rule has no fixtures",
      });
      continue;
    }

    for (const caseName of fs.readdirSync(casesDir).sort()) {
      const caseDir = path.join(casesDir, caseName);
      if (!fs.statSync(caseDir).isDirectory()) continue;

      const expectedPath = path.join(caseDir, "expected.yaml");
      const expected =
        (fs.existsSync(expectedPath) && readYaml(expectedPath)?.violations) || [];

      let actual = [];
      if (rule.engine === "external") {
        // External fixtures replay recorded output instead of running commands.
        const outputPath = path.join(caseDir, "output.jsonl");
        const statusPath = path.join(caseDir, "status.txt");
        const recordedStatus = fs.existsSync(statusPath)
          ? Number(fs.readFileSync(statusPath, "utf8").trim())
          : 0;
        actual = fs.existsSync(outputPath)
          ? parseExternalOutput(rule, fs.readFileSync(outputPath, "utf8"), {
              status: Number.isFinite(recordedStatus) ? recordedStatus : 0,
            })
          : [];
      } else {
        const caseFiles = walk(caseDir).filter((file) => file !== "expected.yaml");
        for (const file of caseFiles) {
          const content = fs.readFileSync(path.join(caseDir, file), "utf8");
          actual.push(...runRule(rule, file, content));
        }
      }

      const problems = [];
      const matched = new Set();
      for (const expectation of expected) {
        const index = actual.findIndex(
          (violation, i) =>
            !matched.has(i) &&
            violation.file === expectation.file &&
            (expectation.line == null || violation.line === expectation.line) &&
            (expectation.message_contains == null ||
              violation.message.includes(expectation.message_contains)),
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
  }

  return results;
}

const SAFE_REF = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

function gitOutput(root, args) {
  const spawned = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return spawned.status === 0 ? spawned.stdout : null;
}

function hasOriginRemote(root) {
  return gitOutput(root, ["remote", "get-url", "origin"]) != null;
}

function parseStatusZ(output) {
  const files = [];
  const entries = String(output || "")
    .split("\0")
    .filter(Boolean);

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const statusCode = entry.slice(0, 2);
    const filePath = entry.slice(3).replace(/\\/g, "/");
    if (filePath) files.push(filePath);
    // Renames and copies carry the source path as the next NUL-separated entry.
    if (/[RC]/.test(statusCode) && entries[index + 1])
      files.push(entries[++index].replace(/\\/g, "/"));
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
    if (!SAFE_REF.test(base))
      return { files: null, note: `unsafe base ref '${base}'`, baseResolved: false };

    const strategies = [
      () =>
        gitOutput(root, [
          "diff",
          "--relative",
          "--name-only",
          "--end-of-options",
          `${base}...HEAD`,
        ]),
      () => {
        if (base.startsWith("origin/") && !hasOriginRemote(root)) return null;
        const branch = base.replace(/^origin\//, "");
        if (!SAFE_REF.test(branch)) return null;
        const fetched = spawnSync(
          "git",
          [
            "fetch",
            "--no-tags",
            "--depth=1",
            "--end-of-options",
            "origin",
            `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
          ],
          { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] },
        );
        if (fetched.status !== 0) return null;
        return gitOutput(root, [
          "diff",
          "--relative",
          "--name-only",
          "--end-of-options",
          `origin/${branch}...HEAD`,
        ]);
      },
      () =>
        gitOutput(root, [
          "diff",
          "--relative",
          "--name-only",
          "FETCH_HEAD",
          "HEAD",
        ]),
    ];

    let resolved = false;
    for (let index = 0; index < strategies.length && !resolved; index++) {
      const output = strategies[index]();
      if (output == null) continue;
      fileSets.push(
        output
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      );
      result.note =
        index === 0
          ? `base ${base}`
          : index === 1
            ? `base origin/${base.replace(/^origin\//, "")} (fetched)`
            : `base ${base} (tree diff vs FETCH_HEAD)`;
      result.baseResolved = true;
      resolved = true;
    }
    if (!resolved) result.note = `base '${base}' unavailable - checked working tree only`;
  }

  result.files = [
    ...new Set(
      fileSets
        .flat()
        .map((file) => file.trim())
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
  if (!guard) return { status: "absent", violations: [], warnings: [] };

  if (!changed) changed = changedFiles(root, base);
  if (changed.files === null)
    return { status: `skipped (${changed.note})`, violations: [], warnings: [] };

  const warnings = [];
  if (base && !changed.baseResolved)
    warnings.push(
      `GUARD-BASE base '${base}' could not be resolved - guard checked the working tree only (set fetch-depth: 0 or fetch the base ref)`,
    );

  const allowGlobs = (guard.zones || []).flatMap((zone) => zone.allow || []);
  const violations = [];
  for (const file of changed.files) {
    if (matchAny(guard.forbidden || [], file))
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
    for (const zone of guard.zones || []) {
      const allow = zone.allow || [];
      if (allow.length && !treeFiles.some((file) => matchAny(allow, file)))
        warnings.push(`GUARD-SCOPE zone '${zone.id}' matches no files in the tree`);
    }

  return {
    status: `checked ${changed.files.length} changed file(s)${changed.note ? ` (${changed.note})` : ""}`,
    violations,
    warnings,
  };
}

function checkExemplars(root, exemplarsDoc) {
  const results = [];
  const exemplars = Array.isArray(exemplarsDoc && exemplarsDoc.exemplars)
    ? exemplarsDoc.exemplars
    : [];
  for (const exemplar of exemplars) {
    const present = fs.existsSync(path.join(root, exemplar.path));
    results.push({
      id: exemplar.id,
      path: exemplar.path,
      ok: present,
      detail: present ? "" : "path does not exist",
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

function checkAdapters(root) {
  const templatesDir = path.join(__dirname, "..", "..", "templates");
  const results = [];

  for (const adapter of ADAPTERS) {
    const generatedPath = path.join(root, adapter.file);
    if (!fs.existsSync(generatedPath)) continue;

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

function gitShow(root, ref, filePath) {
  if (!ref || !SAFE_REF.test(ref)) return null;
  const spawned = spawnSync("git", ["show", `${ref}:${filePath}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return spawned.status === 0 ? spawned.stdout : null;
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

function rulesById(rulesDoc) {
  return new Map(
    (rulesDoc && Array.isArray(rulesDoc.rules) ? rulesDoc.rules : []).map(
      (rule) => [rule.id, rule],
    ),
  );
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
    if (oldRule.advisory !== true && newRule.advisory === true)
      findings.push(`rule '${id}' was made advisory`);
    if (oldRule.must_match === true && newRule.must_match !== true)
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
    if (
      oldRule.engine === "external" &&
      oldRule.run &&
      newRule.run &&
      oldRule.run !== newRule.run
    )
      findings.push(`rule '${id}' changed external command`);

    const oldLayers = new Map((oldRule.layers || []).map((layer) => [layer.name, layer]));
    const newLayers = new Map((newRule.layers || []).map((layer) => [layer.name, layer]));
    for (const [layerName, oldLayer] of oldLayers) {
      const newLayer = newLayers.get(layerName);
      if (newLayer) {
        for (const removed of missingFromNew(oldLayer.path || [], newLayer.path || []))
          findings.push(
            `rule '${id}' narrowed layer '${layerName}' by removing ${JSON.stringify(removed)}`,
          );
      } else {
        findings.push(`rule '${id}' removed layer '${layerName}'`);
      }
    }
    for (const expansion of describeAllowedExpansion(oldRule, newRule))
      findings.push(`rule '${id}' expanded allowed dependency ${expansion}`);
  }

  return findings;
}

function changedAdrFiles(files) {
  return (files || []).filter((file) =>
    /^\.agentlintel\/decisions\/ADR-[^/]+\.md$/i.test(file.replace(/\\/g, "/")),
  );
}

function checkRuleRatcheting(root, rulesDoc, { base = null, changed = null } = {}) {
  if (!changed || changed.files === null)
    return {
      status: `skipped (${changed ? changed.note : "no git"})`,
      findings: [],
      ok: true,
    };
  if (!changed.files.includes(`${KERNEL_DIR}/rules.yaml`))
    return { status: "unchanged", findings: [], ok: true };

  const baselineRef = base || "HEAD";
  const baselineText = gitShow(root, baselineRef, `${KERNEL_DIR}/rules.yaml`);
  if (baselineText == null)
    return { status: `no baseline rules at ${baselineRef}`, findings: [], ok: true };

  let baseline;
  try {
    baseline = YAML.parse(baselineText);
  } catch (error) {
    return {
      status: `baseline rules at ${baselineRef} could not be parsed: ${error.message}`,
      findings: [],
      ok: true,
    };
  }

  const findings = detectRuleWeakening(baseline, rulesDoc || { rules: [] });
  const adrFiles = changedAdrFiles(changed.files);
  return {
    status: findings.length
      ? `checked ${findings.length} rule-set weakening(s)`
      : "checked, no weakening",
    findings,
    adrFiles,
    ok: findings.length === 0 || adrFiles.length > 0,
  };
}

function verify(root, options = {}) {
  const kernel = loadKernel(root);
  const base = resolveBase(options.base);
  const diffMode = Boolean(options.diff);

  let bailFacts = null;
  if (options.bail && kernel.facts) {
    const facts = verifyFacts(root, kernel.facts, { run: options.run !== false });
    bailFacts = facts;
    const stale = facts.filter((fact) => !fact.ok && !fact.pending);
    if (stale.length)
      return {
        root: path.resolve(root),
        mode: "bail",
        kernel_present: true,
        facts,
        rule_violations: [],
        external_engines: [],
        fixtures: [],
        guard: { status: "skipped (--bail)", violations: [], warnings: [] },
        ratchet: { status: "skipped (--bail)", findings: [], ok: true },
        exemplars: [],
        adapters: [],
        dormant_rules: [],
        exempted_count: 0,
        errors: stale.map(
          (fact) => `STALE FACT [${fact.id}] ${fact.claim} -> ${fact.detail}`,
        ),
        warnings: [],
        ok: false,
      };
  }

  const ruleSet = kernel.rules ? preparedRuleSet(kernel.rules) : null;
  const ruleIndex = ruleSet
    ? new Map(ruleSet.all.map((rule) => [rule.id, rule]))
    : new Map();
  const changed = changedFiles(root, base);

  let scanFiles;
  let treeFiles = null;
  if (diffMode) {
    scanFiles = (changed.files || []).filter((file) =>
      fs.existsSync(path.join(root, file)),
    );
  } else {
    treeFiles = walk(root, { skipPrefixes: SKIP_PREFIXES });
    scanFiles = treeFiles;
  }

  const { violations: fileViolations, spans, ruleFileCounts } = kernel.rules
    ? runRulesOnFiles(root, kernel.rules, scanFiles, { rules: ruleSet.fileRules })
    : { violations: [], spans: [], ruleFileCounts: new Map() };
  const external =
    kernel.rules && !diffMode
      ? runExternalRules(root, kernel.rules, {
          run: options.run !== false,
          rules: ruleSet.externalRules,
        })
      : { violations: [], statuses: [] };

  const allViolations = [...fileViolations, ...external.violations];
  applySuppression(allViolations, spans);

  const result = {
    root: path.resolve(root),
    mode: diffMode ? "diff" : "tree",
    kernel_present: Boolean(kernel.facts || kernel.rules),
    facts:
      bailFacts ||
      (kernel.facts
        ? verifyFacts(root, kernel.facts, { run: options.run !== false, treeFiles })
        : []),
    rule_violations: allViolations,
    external_engines: external.statuses,
    fixtures:
      kernel.rules && !options.skipFixtures
        ? runFixtures(root, kernel.rules, { rules: ruleSet.all })
        : [],
    guard: checkGuard(root, kernel.guard, { base, treeFiles, changed }),
    ratchet: checkRuleRatcheting(root, kernel.rules, { base, changed }),
    exemplars: kernel.exemplars ? checkExemplars(root, kernel.exemplars) : [],
    adapters: checkAdapters(root),
    kernel_schema: kernel.schemaErrors || [],
  };

  const errors = [...result.kernel_schema];
  const warnings = [];

  if (!result.kernel_present)
    errors.push(
      "No .agentlintel kernel found (facts.yaml / rules.yaml). Run: agentlintel init",
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
    (violation.severity === "warn" ? warnings : errors).push(
      `RULE [${violation.rule}] ${violation.file}:${violation.line} ${violation.message}`,
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
    if (fs.existsSync(conformanceDir)) {
      const ruleIds = new Set(
        (Array.isArray(kernel.rules.rules) ? kernel.rules.rules : []).map(
          (rule) => rule.id,
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

  if (result.ratchet && !result.ratchet.ok) {
    const remedy = "add/update .agentlintel/decisions/ADR-*.md in the same diff";
    for (const finding of result.ratchet.findings)
      errors.push(`RATCHET [rules.yaml] ${finding}; ${remedy}`);
  }

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
  result.errors = errors;
  result.warnings = warnings;
  result.ok = errors.length === 0 && (!options.strict || warnings.length === 0);
  return result;
}

module.exports = {
  verify,
  loadKernel,
  verifyFacts,
  runRulesOnFiles,
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
