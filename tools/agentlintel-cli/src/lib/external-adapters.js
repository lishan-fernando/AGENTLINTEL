// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

function annotate(rule, violations) {
  if (!rule || !rule.adr) return violations;
  for (const violation of violations)
    if (!violation.adr) violation.adr = rule.adr;
  return violations;
}

function parseExternalOutput(rule, stdout, meta = {}) {
  const adapter = rule.adapter || rule.format || "jsonl";
  if (adapter === "dependency-cruiser")
    return annotate(rule, parseDependencyCruiserOutput(rule, stdout));
  if (adapter === "dotnet-test")
    return annotate(rule, parseDotnetTestOutput(rule, stdout, meta));
  if (adapter === "sarif")
    return annotate(rule, parseSarifOutput(rule, stdout, meta));
  if (adapter === "command-status" || adapter === "status")
    return annotate(rule, parseCommandStatusOutput(rule, stdout, meta));

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
  return annotate(rule, violations);
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

  return [{
    rule: rule.id,
    file,
    line: 0,
    message: (rule.message || "external command failed") + ": " + summary,
    severity: rule.severity,
  }];
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

function sarifRuleId(run, result) {
  if (typeof result.ruleId === "string" && result.ruleId) return result.ruleId;
  if (result.rule && typeof result.rule.id === "string" && result.rule.id)
    return result.rule.id;
  if (Number.isInteger(result.ruleIndex)) {
    const rules = run.tool && run.tool.driver && run.tool.driver.rules;
    const indexed = Array.isArray(rules) ? rules[result.ruleIndex] : null;
    if (indexed && typeof indexed.id === "string" && indexed.id) return indexed.id;
    throw new Error("SARIF result ruleIndex does not resolve to a tool rule");
  }
  return null;
}

function resolveSarifArtifact(run, artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact))
    return null;
  if (typeof artifact.uri === "string" && artifact.uri) return artifact;
  if (artifact.index == null) return artifact;
  if (!Number.isInteger(artifact.index) || artifact.index < 0)
    throw new Error("SARIF artifact index must be a non-negative integer");
  const indexed = Array.isArray(run.artifacts) ? run.artifacts[artifact.index] : null;
  if (!indexed || !indexed.location)
    throw new Error("SARIF artifact index does not resolve to a run artifact");
  return indexed.location;
}

function sarifUriWithBase(run, artifact) {
  const uri = artifact && artifact.uri;
  if (typeof uri !== "string" || !uri) return null;
  const baseId = artifact.uriBaseId;
  if (baseId == null) return uri;
  if (typeof baseId !== "string" || !baseId)
    throw new Error("SARIF artifact uriBaseId must be a non-empty string");
  const bases = run.originalUriBaseIds;
  const base = bases && typeof bases === "object" && !Array.isArray(bases)
    ? bases[baseId]
    : null;
  if (!base || typeof base.uri !== "string" || !base.uri)
    throw new Error(`SARIF artifact uriBaseId '${baseId}' is unresolved`);
  try {
    return new URL(uri, base.uri).href;
  } catch {
    return uri;
  }
}

function canonicalRoot(root) {
  if (!root) return null;
  try {
    return fs.realpathSync.native
      ? fs.realpathSync.native(root)
      : fs.realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}

function sarifFile(uri, root) {
  if (!uri) return "(sarif)";
  let filePath = uri;
  try {
    filePath = uri.startsWith("file:")
      ? fileURLToPath(uri)
      : decodeURIComponent(uri);
  } catch (error) {
    throw new Error(`SARIF artifact URI is invalid: ${error.message || error}`);
  }
  if (root && path.isAbsolute(filePath)) {
    const relative = path.relative(canonicalRoot(root), filePath);
    if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." &&
        !path.isAbsolute(relative))
      filePath = relative;
  }
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "") || "(sarif)";
}

function sarifLocation(run, result, root) {
  if (result.locations == null)
    return { file: "(sarif)", line: 0, column: 0 };
  if (!Array.isArray(result.locations))
    throw new Error("SARIF result locations must be an array");
  const location = result.locations.find((entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry) && entry.physicalLocation,
  );
  if (!location) return { file: "(sarif)", line: 0, column: 0 };
  const physical = location.physicalLocation;
  if (!physical || typeof physical !== "object" || Array.isArray(physical))
    throw new Error("SARIF physicalLocation must be an object");
  const artifact = resolveSarifArtifact(run, physical.artifactLocation);
  const region = physical.region == null ? {} : physical.region;
  if (!region || typeof region !== "object" || Array.isArray(region))
    throw new Error("SARIF region must be an object");
  for (const [name, value] of [
    ["startLine", region.startLine],
    ["startColumn", region.startColumn],
  ])
    if (value != null && (!Number.isInteger(value) || value < 1))
      throw new Error(`SARIF region ${name} must be a positive integer`);
  return {
    file: sarifFile(sarifUriWithBase(run, artifact), root),
    line: region.startLine || 0,
    column: region.startColumn || 0,
  };
}

function parseSarifOutput(rule, stdout, { root = null } = {}) {
  const doc = jsonFromOutput(stdout);
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    throw new Error("SARIF output must be a JSON object");
  if (doc.version !== "2.1.0")
    throw new Error("SARIF output version must be 2.1.0");
  if (!Array.isArray(doc.runs))
    throw new Error("SARIF output runs must be an array");

  const violations = [];
  for (const run of doc.runs) {
    if (!run || typeof run !== "object" || Array.isArray(run))
      throw new Error("SARIF runs must contain objects");
    if (!run.tool || typeof run.tool !== "object" || Array.isArray(run.tool) ||
        !run.tool.driver || typeof run.tool.driver !== "object" ||
        Array.isArray(run.tool.driver) || typeof run.tool.driver.name !== "string" ||
        !run.tool.driver.name)
      throw new Error("SARIF run requires a tool driver name");
    if (run.artifacts != null && !Array.isArray(run.artifacts))
      throw new Error("SARIF run artifacts must be an array");
    if (run.results == null) continue;
    if (!Array.isArray(run.results))
      throw new Error("SARIF run results must be an array");
    for (const result of run.results) {
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("SARIF results must contain objects");
      if (result.ruleId != null &&
          (typeof result.ruleId !== "string" || !result.ruleId))
        throw new Error("SARIF result ruleId must be a non-empty string");
      if (result.ruleIndex != null &&
          (!Number.isInteger(result.ruleIndex) || result.ruleIndex < 0))
        throw new Error("SARIF result ruleIndex must be a non-negative integer");
      if (result.kind === "pass") continue;
      const message = result.message;
      if (!message || typeof message !== "object" || Array.isArray(message))
        throw new Error("SARIF result message must be an object");
      const messageText = typeof message.text === "string" && message.text
        ? message.text
        : typeof message.markdown === "string" && message.markdown
          ? message.markdown
          : null;
      if (!messageText)
        throw new Error("SARIF result message requires text or markdown");
      const diagnostic = sarifRuleId(run, result);
      const location = sarifLocation(run, result, root);
      violations.push({
        rule: rule.id,
        file: location.file,
        line: location.line,
        column: location.column,
        message: diagnostic ? `[${diagnostic}] ${messageText}` : messageText,
        severity: rule.severity,
      });
    }
  }
  return violations;
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
  return [{
    rule: rule.id,
    file: "(dotnet-test)",
    line: 0,
    message: `dotnet test failed: ${summary}`,
    severity: rule.severity,
  }];
}

module.exports = {
  parseExternalOutput,
  parseCommandStatusOutput,
  parseDependencyCruiserOutput,
  parseDotnetTestOutput,
  parseSarifOutput,
};
