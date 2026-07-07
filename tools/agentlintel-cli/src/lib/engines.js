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
  const lines = content.split(/\r?\n/);
  const forbidden =
    rule._forbiddenRegexes ||
    (rule.forbidden || []).map(
      (pattern) => new RegExp(pattern, rule.flags || ""),
    );

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

const CODE_LITERAL =
  /['"]([A-Za-z][A-Za-z0-9]*)-([A-Za-z][A-Za-z0-9]*)-(\d{1,5})['"]/g;

function errorCodesEngine(rule, filePath, content, options = {}) {
  if (!options.skipApplies && !applies(rule, filePath)) return [];

  const categories = rule._categories || new Set(rule.categories || []);
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    for (const match of lines[lineIndex].matchAll(CODE_LITERAL)) {
      const [, slice, category] = match;
      const problems = [];

      if (slice !== slice.toUpperCase())
        problems.push(`slice segment '${slice}' must be uppercase`);
      if (
        !(
          category === category.toUpperCase() &&
          categories.has(category.toUpperCase())
        )
      )
        problems.push(
          `category '${category}' is not a registered category (${[...categories].join(", ")})`,
        );

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

const EXPIRES_FIELD = /\bExpires\s*:\s*(\d{4}-\d{2}-\d{2})/;

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
    rule.required_fields || ["Reason", "Approver", "Expires", "Owner"];
  const withinLines = rule._withinLines || rule.within_lines || 5;
  const annotation =
    rule._exemptionAnnotation ||
    new RegExp((rule._markerEsc || escapeForRegex(marker)) + "\\s*:\\s*\\S");
  const fieldRegexes =
    rule._fieldRegexes ||
    requiredFields.map((field) => [field, new RegExp(`\\b${field}\\s*:`)]);

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
    if (expiresMatch) {
      // End-of-day UTC: an exemption is valid through its Expires date.
      const expiry = new Date(expiresMatch[1] + "T23:59:59Z");
      if (Number.isFinite(expiry.getTime()) && expiry < today)
        violations.push({
          rule: rule.id,
          file: filePath,
          line: lineIndex + 1,
          message: `Exemption expired on ${expiresMatch[1]}. Expired exemptions block CI.`,
          severity: "error",
        });
    }
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
    rule.required_fields || ["Reason", "Approver", "Expires", "Owner"];
  const withinLines = rule._withinLines || rule.within_lines || 5;
  const spanPattern =
    rule._exemptionSpan ||
    new RegExp(
      (rule._markerEsc || escapeForRegex(marker)) + "\\s*:\\s*(\\S[^\\n]*)",
    );
  const fieldRegexes =
    rule._fieldRegexes ||
    requiredFields.map((field) => [field, new RegExp(`\\b${field}\\s*:`)]);

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
    const expiry = new Date(expiresMatch[1] + "T23:59:59Z");
    if (!Number.isFinite(expiry.getTime()) || expiry < today) continue;

    let lastFieldLine = lineIndex;
    for (let offset = 0; offset < windowLines.length; offset++)
      if (fieldRegexes.some(([, fieldRegex]) => fieldRegex.test(windowLines[offset])))
        lastFieldLine = lineIndex + 1 + offset;

    spans.push({
      file: filePath,
      rules: ruleIds,
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
const PY_FROM_IMPORT = /^[ \t]*from\s+([.\w]+)\s+import\s+([\w*][\w*, \t]*)/gm;
const PY_IMPORT = /^[ \t]*import\s+([.\w]+)[ \t]*(?:as\s+\w+)?[ \t]*$/gm;
const NS_IMPORT =
  /^[ \t]*(?:using|import)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*;?/gm;
const GO_IMPORT = /^[ \t]*"([^".][^"]+)"/gm;
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
  ".py",
  ".cs",
  ".go",
  ".java",
  ".kt",
  ".swift",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/__init__.py",
];

function lineOfIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++)
    if (content.charCodeAt(i) === 10) line++;
  return line;
}

function modulePath(moduleName) {
  return String(moduleName || "")
    .replace(/::/g, "/")
    .replace(/\./g, "/");
}

function pyModuleToPath(filePath, moduleName) {
  if (moduleName.startsWith(".")) {
    const dots = moduleName.match(/^\.+/)[0].length;
    const suffix = moduleName.slice(dots).replace(/\./g, "/");
    let baseSegments = filePath.split("/").slice(0, -1);
    for (let level = 1; level < dots; level++)
      baseSegments = baseSegments.slice(0, -1);
    return normalizePosix([...baseSegments, suffix].filter(Boolean).join("/"));
  }
  return modulePath(moduleName);
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

function layerOfPath(layers, relPath) {
  if (!relPath || relPath.startsWith("..")) return null;
  const lowerPath = relPath.toLowerCase();
  return (
    layers.find((layer) =>
      (layer.path || []).some((glob) => {
        const lowerGlob = String(glob).toLowerCase();
        // "src/domain/**" also claims the bare directory path "src/domain".
        if (lowerGlob.endsWith("/**") && lowerPath === lowerGlob.slice(0, -3))
          return true;
        return matchGlob(lowerGlob, lowerPath);
      }),
    ) || null
  );
}

function layerOfImport(layers, importPath) {
  if (!importPath) return null;
  for (const suffix of IMPORT_TARGET_SUFFIXES) {
    const layer = layerOfPath(layers, importPath + suffix);
    if (layer) return layer;
  }
  return null;
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
  const layers = rule.layers || [];
  if (!layers.length) problems.push("declares no layers");

  const declaredNames = new Set();
  for (const layer of layers) {
    if (layer && layer.name) declaredNames.add(layer.name);
    else problems.push("a layer is missing a name");
    if (!(layer && Array.isArray(layer.path) && layer.path.length))
      problems.push(`layer '${layer && layer.name}' has no path globs`);
  }

  for (const [layerName, targets] of Object.entries(rule.allowed || {})) {
    if (!declaredNames.has(layerName))
      problems.push(`allowed references undeclared layer '${layerName}'`);
    for (const target of targets || [])
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

  const layers = rule.layers || [];
  const fromLayer = layerOfPath(layers, filePath);
  if (!fromLayer) return [];

  const allowed =
    rule._allowedByLayer?.[fromLayer.name] ||
    new Set(rule.allowed?.[fromLayer.name] || []);
  const aliasEntries = aliasEntriesOf(rule);
  const isPython = /\.py$/i.test(filePath);
  const violations = [];
  const reported = new Set();

  const check = (importText, resolvedTarget, matchIndex) => {
    const toLayer = layerOfImport(layers, resolvedTarget);
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

  if (isPython) {
    for (const match of content.matchAll(PY_FROM_IMPORT)) {
      const base = pyModuleToPath(filePath, match[1]);
      check(match[1], base, match.index);
      for (const imported of match[2].split(",")) {
        const name = imported.trim().split(/\s+/)[0];
        if (name && name !== "*")
          check(`${match[1]}.${name}`, base ? `${base}/${name}` : name, match.index);
      }
    }
    for (const match of content.matchAll(PY_IMPORT))
      check(match[1], pyModuleToPath(filePath, match[1]), match.index);
  } else {
    if (!/\.go$/i.test(filePath)) {
      for (const pattern of JS_IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of content.matchAll(pattern))
          check(match[1], resolveSpec(filePath, match[1], aliasEntries, layers), match.index);
      }
    }
    if (/\.(cs|java|kt|swift)$/i.test(filePath))
      for (const match of content.matchAll(NS_IMPORT))
        check(match[1], resolveSpec(filePath, modulePath(match[1]), aliasEntries, layers), match.index);
    if (/\.go$/i.test(filePath))
      for (const match of content.matchAll(GO_IMPORT))
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
  } else if (rule.engine === "error-codes") {
    prepared._categories = new Set(rule.categories || []);
  } else if (rule.engine === "exemptions") {
    prepared._marker = rule.marker || "AGENTLINTEL-EXEMPT";
    prepared._requiredFields = rule.required_fields || [
      "Reason",
      "Approver",
      "Expires",
      "Owner",
    ];
    prepared._withinLines = rule.within_lines || 5;
    prepared._markerEsc = escapeForRegex(prepared._marker);
    prepared._exemptionAnnotation = new RegExp(
      prepared._markerEsc + "\\s*:\\s*\\S",
    );
    prepared._exemptionSpan = new RegExp(
      prepared._markerEsc + "\\s*:\\s*(\\S[^\\n]*)",
    );
    prepared._fieldRegexes = prepared._requiredFields.map((field) => [
      field,
      new RegExp(`\\b${field}\\s*:`),
    ]);
    prepared._expiresRegex = EXPIRES_FIELD;
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
  collectExemptionSpans,
  layerOfPath,
  validateLayersRule,
};
