// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const { matchAny, matchGlob } = require("./io");

function applies(rule, filePath) {
  const appliesTo =
    rule._appliesTo ||
    (rule.applies_to && rule.applies_to.length ? rule.applies_to : ["**/*"]);
  if (!matchAny(appliesTo, filePath)) return false;
  const excludes = rule._excludes || rule.excludes;
  return !excludes || !matchAny(excludes, filePath);
}

function regexEngine(rule, filePath, content, options = {}) {
  if (!options.skipApplies && !applies(rule, filePath)) return [];

  const violations = [];
  const forbidden =
    rule._forbiddenRegexes ||
    (rule.forbidden || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
  const matchMode = rule._regexMatch || rule.match || "line";

  if (matchMode === "file") {
    for (const regex of forbidden) {
      regex.lastIndex = 0;
      const match = regex.exec(content);
      if (!match) continue;
      violations.push({
        rule: rule.id,
        file: filePath,
        line: lineOfIndex(content, match.index),
        message: rule.message,
        severity: rule.severity,
      });
    }
    return violations;
  }

  const lines = content.split(/\r?\n/);
  for (const regex of forbidden) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      regex.lastIndex = 0;
      if (!regex.test(lines[lineIndex])) continue;
      violations.push({
        rule: rule.id,
        file: filePath,
        line: lineIndex + 1,
        message: rule.message,
        severity: rule.severity,
      });
    }
  }

  return violations;
}

function regexMatches(regex, content, matchMode) {
  if (matchMode === "file") {
    regex.lastIndex = 0;
    return regex.test(content);
  }
  for (const line of content.split(/\r?\n/)) {
    regex.lastIndex = 0;
    if (regex.test(line)) return true;
  }
  return false;
}

function requiredRegexViolations(rule, entries, { baselineEntries = [] } = {}) {
  const required = rule._requiredRegexes ||
    (rule.required || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
  if (!required.length || !entries.length) return [];

  const matchMode = rule._regexMatch || rule.match || "line";
  const when = rule._whenRegexes ||
    (rule.when || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
  if (when.length && !when.some((regex) =>
    entries.some((entry) => regexMatches(regex, entry.content, matchMode)))) {
    const baselineMatched = when.some((regex) =>
      baselineEntries.some((entry) =>
        regexMatches(regex, entry.content, matchMode)));
    if (!baselineMatched) return [];
    return [{
      rule: rule.id,
      file: baselineEntries[0].filePath,
      line: 0,
      message: `Required-evidence trigger matched the baseline but disappeared. Conditional rules cannot be deactivated by deleting their trigger. ${rule.message}`,
      severity: rule.severity,
    }];
  }

  const violations = [];
  for (let index = 0; index < required.length; index++) {
    if (entries.some((entry) => regexMatches(required[index], entry.content, matchMode)))
      continue;
    const pattern = (rule.required || [])[index] || required[index].source;
    violations.push({
      rule: rule.id,
      file: entries[0].filePath,
      line: 0,
      message: `Required architecture evidence not found: ${JSON.stringify(pattern)}. ${rule.message}`,
      severity: rule.severity,
    });
  }
  return violations;
}

const CODE_LITERAL =
  /['"]([A-Za-z][^-'"\s]*)-([A-Za-z][^-'"\s]*)-([^'"\s]+)['"]/g;

function errorCodesEngine(rule, filePath, content, options = {}) {
  if (!options.skipApplies && !applies(rule, filePath)) return [];

  const categories = rule._categories || new Set(rule.categories || []);
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    for (const match of lines[lineIndex].matchAll(CODE_LITERAL)) {
      const [, slice, category, suffix] = match;
      const problems = [];

      if (!/^[A-Z][A-Z0-9]*$/.test(slice))
        problems.push(`slice segment '${slice}' must be uppercase alphanumeric`);
      if (
        !(
          category === category.toUpperCase() &&
          categories.has(category.toUpperCase())
        )
      )
        problems.push(
          `category '${category}' is not a registered category (${[...categories].join(", ")})`,
        );
      if (!/^\d{1,5}$/.test(suffix))
        problems.push(`suffix '${suffix}' must be 1-5 digits`);

      if (problems.length)
        violations.push({
          rule: rule.id,
          file: filePath,
          line: lineIndex + 1,
          message: `${rule.message} [${match[0]}: ${problems.join("; ")}]`,
          severity: rule.severity,
        });
    }
  }

  return violations;
}

function escapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metadataRegex(label, valuePattern) {
  return new RegExp(
    `^[ \\t]*(?:(?://+|#+|--+|/\\*+|\\*+)[ \\t]*)?${escapeForRegex(label)}[ \\t]*:[ \\t]*${valuePattern}`,
    "m",
  );
}

const EXPIRES_FIELD = metadataRegex(
  "Expires",
  "(\\d{4}-\\d{2}-\\d{2})(?=[ \\t]*(?:\\n|$))",
);
const DECISION_FIELD = metadataRegex(
  "Decision",
  "(ADR-\\d+)(?=[ \\t]*(?:\\n|$))",
);

function expiryDate(value) {
  const date = new Date(value + "T23:59:59Z");
  if (!Number.isFinite(date.getTime())) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

function exemptionsEngine(
  rule,
  filePath,
  content,
  { today = new Date(), skipApplies = false } = {},
) {
  if (!skipApplies && !applies(rule, filePath)) return [];

  const marker = rule._marker || rule.marker || "AGENTLINTEL-EXEMPT";
  if (!content.includes(marker)) return [];

  const requiredFields = rule._requiredFields ||
    rule.required_fields || ["Reason", "Approver", "Expires", "Owner", "Decision"];
  const withinLines = rule._withinLines || rule.within_lines || 5;
  const annotation =
    rule._exemptionAnnotation ||
    metadataRegex(marker, "\\S");
  const fieldRegexes =
    rule._fieldRegexes ||
    requiredFields.map((field) => [
      field,
      metadataRegex(field, "\\S"),
    ]);

  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (!annotation.test(lines[lineIndex])) continue;

    const window = lines
      .slice(lineIndex + 1, lineIndex + 1 + withinLines)
      .join("\n");
    const missingFields = fieldRegexes
      .filter(([, fieldRegex]) => !fieldRegex.test(window))
      .map(([field]) => field);

    if (missingFields.length)
      violations.push({
        rule: rule.id,
        file: filePath,
        line: lineIndex + 1,
        message: `Exemption missing required field(s): ${missingFields.join(", ")}. ${rule.message}`,
        severity: rule.severity,
      });

    const expiresMatch = window.match(rule._expiresRegex || EXPIRES_FIELD);
    if (!expiresMatch && requiredFields.includes("Expires") && !missingFields.includes("Expires"))
      violations.push({
        rule: rule.id,
        file: filePath,
        line: lineIndex + 1,
        message: `Exemption expiry must use YYYY-MM-DD. ${rule.message}`,
        severity: "error",
      });
    if (expiresMatch) {
      // End-of-day UTC: an exemption is valid through its Expires date.
      const expiry = expiryDate(expiresMatch[1]);
      if (!expiry)
        violations.push({
          rule: rule.id,
          file: filePath,
          line: lineIndex + 1,
          message: `Exemption has invalid expiry date '${expiresMatch[1]}'. ${rule.message}`,
          severity: "error",
        });
      else if (expiry < today)
        violations.push({
          rule: rule.id,
          file: filePath,
          line: lineIndex + 1,
          message: `Exemption expired on ${expiresMatch[1]}. Expired exemptions block CI.`,
          severity: "error",
        });
    }
    const decisionMatch = window.match(rule._decisionRegex || DECISION_FIELD);
    if (!decisionMatch && requiredFields.includes("Decision") &&
        !missingFields.includes("Decision"))
      violations.push({
        rule: rule.id,
        file: filePath,
        line: lineIndex + 1,
        message: `Exemption Decision must use ADR-<number>. ${rule.message}`,
        severity: "error",
      });
  }

  return violations;
}

function collectExemptionSpans(
  rule,
  filePath,
  content,
  { today = new Date(), skipApplies = false } = {},
) {
  if (!skipApplies && !applies(rule, filePath)) return [];

  const marker = rule._marker || rule.marker || "AGENTLINTEL-EXEMPT";
  if (!content.includes(marker)) return [];

  const requiredFields = rule._requiredFields ||
    rule.required_fields || ["Reason", "Approver", "Expires", "Owner", "Decision"];
  const withinLines = rule._withinLines || rule.within_lines || 5;
  const spanPattern =
    rule._exemptionSpan ||
    metadataRegex(marker, "(\\S[^\\n]*)");
  const fieldRegexes =
    rule._fieldRegexes ||
    requiredFields.map((field) => [
      field,
      metadataRegex(field, "\\S"),
    ]);

  const spans = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const markerMatch = lines[lineIndex].match(spanPattern);
    if (!markerMatch) continue;

    const ruleIds = markerMatch[1]
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean);
    const windowLines = lines.slice(lineIndex + 1, lineIndex + 1 + withinLines);
    const window = windowLines.join("\n");

    // Only a complete, unexpired exemption suppresses anything.
    if (fieldRegexes.some(([, fieldRegex]) => !fieldRegex.test(window)))
      continue;
    const expiresMatch = window.match(rule._expiresRegex || EXPIRES_FIELD);
    if (!expiresMatch) continue;
    const expiry = expiryDate(expiresMatch[1]);
    if (!expiry || expiry < today) continue;
    const decisionMatch = window.match(rule._decisionRegex || DECISION_FIELD);
    if (!decisionMatch) continue;

    let lastFieldLine = lineIndex;
    for (let offset = 0; offset < windowLines.length; offset++)
      if (fieldRegexes.some(([, fieldRegex]) => fieldRegex.test(windowLines[offset])))
        lastFieldLine = lineIndex + 1 + offset;

    spans.push({
      file: filePath,
      rules: ruleIds,
      decision: decisionMatch[1],
      expires: expiresMatch[1],
      fromLine: lineIndex + 1,
      toLine: lastFieldLine + 1 + withinLines,
    });
  }

  return spans;
}

const JS_IMPORT_PATTERNS = [
  /\bimport\s+(?!['"(])[^;'"]*?from\s+['"]([^'"]+)['"]/g,
  /\bexport\s+(?!['"(])[^;'"]*?from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
];
const IMPORT_TARGET_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

function lineOfIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++)
    if (content.charCodeAt(i) === 10) line++;
  return line;
}

function normalizePosix(rawPath) {
  const segments = [];
  for (const segment of rawPath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length && segments[segments.length - 1] !== "..")
        segments.pop();
      else segments.push("..");
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function layersOfPath(layers, relPath) {
  if (!relPath || relPath.startsWith("..")) return [];
  const lowerPath = relPath.toLowerCase();
  return layers.filter((layer) =>
      (Array.isArray(layer && layer.path) ? layer.path : []).some((glob) => {
        const lowerGlob = String(glob).toLowerCase();
        // "src/domain/**" also claims the bare directory path "src/domain".
        if (lowerGlob.endsWith("/**") && lowerPath === lowerGlob.slice(0, -3))
          return true;
        return matchGlob(lowerGlob, lowerPath);
      }),
    );
}

function layerOfPath(layers, relPath) {
  return layersOfPath(layers, relPath)?.[0] || null;
}

function layersOfImport(layers, importPath) {
  if (!importPath) return [];
  for (const suffix of IMPORT_TARGET_SUFFIXES) {
    const matches = layersOfPath(layers, importPath + suffix);
    if (matches.length) return matches;
  }
  return [];
}

function layerOfImport(layers, importPath) {
  return layersOfImport(layers, importPath)[0] || null;
}

function resolveSpec(filePath, spec, aliasEntries, layers) {
  for (const [alias, target] of aliasEntries) {
    if (spec.startsWith(alias)) {
      const resolved = normalizePosix(target + spec.slice(alias.length));
      return resolved.startsWith("..") ? null : resolved;
    }
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const dir = filePath.split("/").slice(0, -1).join("/");
    const resolved = normalizePosix(dir ? `${dir}/${spec}` : spec);
    return resolved.startsWith("..") ? null : resolved;
  }
  // Bare specifiers only count when they land in a declared layer.
  return layerOfImport(layers, spec) ? normalizePosix(spec) : null;
}

function validateLayersRule(rule) {
  const problems = [];
  const layers = Array.isArray(rule.layers) ? rule.layers : [];
  if (!layers.length) problems.push("declares no layers");

  const declaredNames = new Set();
  for (const layer of layers) {
    if (!(layer && typeof layer === "object" && !Array.isArray(layer))) {
      problems.push("a layer must be an object");
      continue;
    }
    if (typeof layer.name !== "string" || !layer.name) {
      problems.push("a layer is missing a name");
    } else if (declaredNames.has(layer.name)) {
      problems.push(`duplicate layer name '${layer.name}'`);
    } else {
      declaredNames.add(layer.name);
    }
    if (!Array.isArray(layer.path) || !layer.path.length ||
        layer.path.some((glob) => typeof glob !== "string" || !glob))
      problems.push(`layer '${layer && layer.name}' has no path globs`);
  }

  for (const [layerName, targets] of Object.entries(rule.allowed || {})) {
    if (!declaredNames.has(layerName))
      problems.push(`allowed references undeclared layer '${layerName}'`);
    if (!Array.isArray(targets)) {
      problems.push(`allowed.${layerName} must be an array`);
      continue;
    }
    for (const target of targets)
      if (!declaredNames.has(target))
        problems.push(
          `allowed.${layerName} references undeclared layer '${target}'`,
        );
  }

  return problems;
}

function aliasEntriesOf(rule) {
  return (
    rule._aliasEntries ||
    Object.entries(rule.aliases || {}).sort(
      (a, b) => b[0].length - a[0].length,
    )
  );
}

function layersEngine(rule, filePath, content, options = {}) {
  if (!options.skipApplies && !applies(rule, filePath)) return [];

  if (!/\.(?:[cm]?[jt]sx?)$/i.test(filePath))
    return [{
      rule: rule.id,
      file: filePath,
      line: 0,
      message: "The built-in layers engine supports JavaScript/TypeScript imports only; use an external native architecture checker.",
      severity: "error",
    }];

  const layers = rule.layers || [];
  const fromLayers = layersOfPath(layers, filePath);
  const fromLayer = fromLayers[0];
  if (!fromLayer) return [];
  if (fromLayers.length > 1)
    return [{
      rule: rule.id,
      file: filePath,
      line: 0,
      message: `Path matches multiple layers (${fromLayers.map((layer) => layer.name).join(", ")}); layer coverage must not overlap.`,
      severity: "error",
    }];

  const allowed =
    rule._allowedByLayer?.[fromLayer.name] ||
    new Set(rule.allowed?.[fromLayer.name] || []);
  const aliasEntries = aliasEntriesOf(rule);
  const violations = [];
  const reported = new Set();

  const check = (importText, resolvedTarget, matchIndex) => {
    const toLayers = layersOfImport(layers, resolvedTarget);
    const toLayer = toLayers[0];
    if (toLayers.length > 1) {
      const line = lineOfIndex(content, matchIndex);
      const key = `ambiguous:${line}:${resolvedTarget}`;
      if (!reported.has(key)) {
        reported.add(key);
        violations.push({
          rule: rule.id,
          file: filePath,
          line,
          message: `Import target '${resolvedTarget}' matches multiple layers (${toLayers.map((layer) => layer.name).join(", ")}); layer coverage must not overlap.`,
          severity: "error",
        });
      }
      return;
    }
    if (!toLayer || toLayer.name === fromLayer.name || allowed.has(toLayer.name))
      return;
    const line = lineOfIndex(content, matchIndex);
    const key = `${toLayer.name}:${line}`;
    if (reported.has(key)) return;
    reported.add(key);
    violations.push({
      rule: rule.id,
      file: filePath,
      line,
      message:
        `Layer '${fromLayer.name}' must not depend on layer '${toLayer.name}' (import of ${importText}). ${rule.message || ""}`.trim(),
      severity: rule.severity,
    });
  };

  for (const pattern of JS_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern))
      check(match[1], resolveSpec(filePath, match[1], aliasEntries, layers), match.index);
  }

  return violations;
}

const ENGINES = {
  regex: regexEngine,
  "error-codes": errorCodesEngine,
  exemptions: exemptionsEngine,
  layers: layersEngine,
};

function prepareRule(rule) {
  const prepared = { ...rule };
  prepared._appliesTo =
    rule.applies_to && rule.applies_to.length ? rule.applies_to : ["**/*"];
  prepared._excludes = rule.excludes || [];

  if (rule.engine === "regex") {
    prepared._forbiddenRegexes = (rule.forbidden || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
    prepared._requiredRegexes = (rule.required || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
    prepared._whenRegexes = (rule.when || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );
    prepared._regexMatch = rule.match || "line";
  } else if (rule.engine === "error-codes") {
    prepared._categories = new Set(rule.categories || []);
  } else if (rule.engine === "exemptions") {
    prepared._marker = rule.marker || "AGENTLINTEL-EXEMPT";
    prepared._requiredFields = rule.required_fields || [
      "Reason",
      "Approver",
      "Expires",
      "Owner",
      "Decision",
    ];
    prepared._withinLines = rule.within_lines || 5;
    prepared._exemptionAnnotation = metadataRegex(prepared._marker, "\\S");
    prepared._exemptionSpan = metadataRegex(prepared._marker, "(\\S[^\\n]*)");
    prepared._fieldRegexes = prepared._requiredFields.map((field) => [
      field,
      metadataRegex(field, "\\S"),
    ]);
    prepared._expiresRegex = EXPIRES_FIELD;
    prepared._decisionRegex = DECISION_FIELD;
  } else if (rule.engine === "layers") {
    prepared._aliasEntries = aliasEntriesOf(rule);
    prepared._allowedByLayer = Object.fromEntries(
      Object.entries(rule.allowed || {}).map(([layerName, targets]) => [
        layerName,
        new Set(targets || []),
      ]),
    );
  }

  return prepared;
}

function runRule(rule, filePath, content, options) {
  const engine = ENGINES[rule.engine];
  if (!engine) throw new Error(`Unknown engine '${rule.engine}' for rule ${rule.id}`);
  return engine(rule, filePath, content, options);
}

module.exports = {
  runRule,
  ENGINES,
  prepareRule,
  requiredRegexViolations,
  collectExemptionSpans,
  layerOfPath,
  validateLayersRule,
};
