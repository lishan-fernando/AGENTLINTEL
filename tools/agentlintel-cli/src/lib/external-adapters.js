// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

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
};
