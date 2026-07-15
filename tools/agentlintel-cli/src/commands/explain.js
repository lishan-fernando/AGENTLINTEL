// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { layerOfPath, validateLayersRule } = require("../lib/engines");
const { matchGlob } = require("../lib/io");
const { loadKernel, preparedRuleSet, ruleApplies } = require("../lib/verify");

const KERNEL_DIR = ".agentlintel";

function toRepoPath(root, inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) return "";

  const absolute = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(root, raw);
  const relative = path.relative(root, absolute);
  const safeRelative =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative
      : raw;
  return safeRelative.replace(/\\/g, "/").replace(/^\.\//, "");
}

function arrayOf(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function decisionIdFromFile(fileName) {
  const match = String(fileName).match(/^(ADR-\d+)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/);
  return match ? match[1] : null;
}

function safeRegularPath(root, filePath) {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  let cursor = path.resolve(root);
  try {
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (fs.lstatSync(cursor).isSymbolicLink()) return false;
    }
    const inside = path.relative(fs.realpathSync(root), fs.realpathSync(filePath));
    return fs.lstatSync(filePath).isFile() &&
      !inside.startsWith("..") && !path.isAbsolute(inside);
  } catch {
    return false;
  }
}

function decisionIndex(root) {
  const dir = path.join(root, KERNEL_DIR, "decisions");
  const index = new Map();
  try {
    if (!fs.lstatSync(dir).isDirectory()) return index;
  } catch {
    return index;
  }

  for (const fileName of fs.readdirSync(dir).sort()) {
    const id = decisionIdFromFile(fileName);
    if (!id) continue;
    const relPath = `${KERNEL_DIR}/decisions/${fileName}`;
    if (!safeRegularPath(root, path.join(root, relPath))) continue;
    let title = "";
    try {
      title = fs
        .readFileSync(path.join(root, relPath), "utf8")
        .split(/\r?\n/)[0]
        .replace(/^#\s*/, "")
        .trim();
    } catch {}
    index.set(id, { id, path: relPath, title });
  }
  return index;
}

function explainRules(rulesDoc, relPath) {
  if (!rulesDoc) return [];
  const ruleSet = preparedRuleSet(rulesDoc);
  return ruleSet.all
    .filter((rule) => ruleApplies(rule, relPath))
    .map((rule) => {
      const appliesTo = rule._appliesTo || ["**/*"];
      const excludes = rule._excludes || [];
      const matched = appliesTo.filter((glob) => matchGlob(glob, relPath));
      const item = {
        id: rule.id,
        severity: rule.severity || "error",
        engine: rule.engine,
        applies_to: appliesTo,
        matched_applies_to: matched,
        why: `matches applies_to ${matched.join(", ") || "**/*"}`,
      };

      if (excludes.length) item.excludes = excludes;
      if (rule.adr) item.adr = rule.adr;
      if (rule.engine === "layers") {
        const layer = layerOfPath(rule.layers || [], relPath);
        item.layer = layer ? layer.name : null;
        item.layer_note = layer
          ? `path is in layer '${layer.name}'`
          : "path matches applies_to but no declared layer";
        const problems = validateLayersRule(rule);
        if (problems.length) item.config_warnings = problems;
      }
      return item;
    });
}

function explainGuard(guard, relPath) {
  if (!guard)
    return {
      status: "absent",
      forbidden: [],
      zones: [],
      note: "no guard.json found",
    };

  const forbiddenGlobs = Array.isArray(guard.forbidden) ? guard.forbidden : [];
  const guardZones = Array.isArray(guard.zones) ? guard.zones : [];
  const forbidden = forbiddenGlobs.filter((glob) =>
    matchGlob(glob, relPath),
  );
  const zones = guardZones
    .map((zone) => ({
      id: zone.id,
      matched_allow: (Array.isArray(zone.allow) ? zone.allow : [])
        .filter((glob) => matchGlob(glob, relPath)),
    }))
    .filter((zone) => zone.matched_allow.length);

  const allowGlobs = guardZones.flatMap((zone) =>
    Array.isArray(zone.allow) ? zone.allow : []);
  const outsideZones = allowGlobs.length > 0 && zones.length === 0;

  return {
    status: forbidden.length
      ? "forbidden"
      : outsideZones
        ? "outside-zones"
        : zones.length
          ? "allowed"
          : "no-zones",
    forbidden,
    zones,
    note: forbidden.length
      ? "a changed file at this path would violate guard.forbidden"
      : outsideZones
        ? "a changed file at this path would be outside every write zone"
        : zones.length
          ? "a changed file at this path is inside at least one write zone"
          : "guard has no allow zones",
  };
}

function explainExemplars(exemplarsDoc, relPath, shape) {
  const exemplars = Array.isArray(exemplarsDoc && exemplarsDoc.exemplars)
    ? exemplarsDoc.exemplars
    : [];
  return exemplars
    .filter((exemplar) => {
      if (shape) return exemplar.shape === shape;
      const exemplarPath = String(exemplar.path || "").replace(/\\/g, "/");
      return relPath === exemplarPath || relPath.startsWith(`${exemplarPath}/`);
    })
    .map((exemplar) => ({
      id: exemplar.id,
      path: exemplar.path,
      shape: exemplar.shape,
      why: shape
        ? `registered for requested shape '${shape}'`
        : "path is inside this registered exemplar",
    }));
}

function explainFacts(factsDoc, relPath) {
  const facts = Array.isArray(factsDoc && factsDoc.facts) ? factsDoc.facts : [];
  return facts
    .filter((fact) => {
      const check = fact && fact.check;
      if (!check || typeof check !== "object") return false;
      if (typeof check.path === "string")
        return relPath === check.path || relPath.startsWith(`${check.path}/`);
      return typeof check.pattern === "string" && matchGlob(check.pattern, relPath);
    })
    .map((fact) => ({
      id: fact.id,
      claim: fact.claim,
      check: fact.check,
    }));
}

function explainDecisions(root, relPath, rules) {
  const decisions = decisionIndex(root);
  const byId = new Map();

  for (const rule of rules)
    for (const adr of arrayOf(rule.adr)) {
      const id = String(adr).toUpperCase();
      byId.set(id, {
        ...(decisions.get(id) || { id }),
        why: `referenced by rule '${rule.id}'`,
      });
    }

  const decisionMatch = relPath.match(/^\.agentlintel\/decisions\/([^/]+)$/);
  if (decisionMatch) {
    const id = decisionIdFromFile(decisionMatch[1]);
    if (id)
      byId.set(id, {
        ...(decisions.get(id) || { id, path: relPath }),
        why: "target path is this decision record",
      });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function existingContextFiles(root) {
  const files = [
    "AGENTS.md",
    ".agents/skills/scope-change/SKILL.md",
    `${KERNEL_DIR}/facts.yaml`,
    `${KERNEL_DIR}/rules.yaml`,
    `${KERNEL_DIR}/guard.json`,
    `${KERNEL_DIR}/exemplars.yaml`,
  ];
  const decisions = path.join(root, KERNEL_DIR, "decisions");
  try {
    for (const name of fs.readdirSync(decisions).sort())
      if (decisionIdFromFile(name)) files.push(`${KERNEL_DIR}/decisions/${name}`);
  } catch {}
  return files.filter((file) => safeRegularPath(root, path.join(root, file)));
}

function contextBytes(root, files) {
  return [...new Set(files)].reduce((total, file) => {
    try {
      return total + fs.statSync(path.join(root, file)).size;
    } catch {
      return total;
    }
  }, 0);
}

function compactResult(root, result) {
  const packet = {
    ok: true,
    path: result.path,
    shape: result.shape || null,
    facts: result.facts.map((fact) => ({ id: fact.id, check: fact.check })),
    rules: result.rules.map((rule) => ({
      id: rule.id,
      engine: rule.engine,
      ...(rule.adr ? { adr: rule.adr } : {}),
      ...(rule.layer ? { layer: rule.layer } : {}),
    })),
    guard: {
      status: result.guard.status,
      forbidden: result.guard.forbidden,
      zones: result.guard.zones.map((zone) => zone.id),
    },
    exemplars: result.exemplars.map(({ id, path: exemplarPath, shape }) => ({
      id,
      path: exemplarPath,
      shape,
    })),
    decisions: result.decisions.map(({ id, path: decisionPath }) => ({
      id,
      ...(decisionPath ? { path: decisionPath } : {}),
    })),
  };
  const fullFiles = existingContextFiles(root);
  const frontierFiles = [
    "AGENTS.md",
    ".agents/skills/scope-change/SKILL.md",
    ...packet.exemplars.map((entry) => entry.path),
    ...packet.decisions.map((entry) => entry.path).filter(Boolean),
  ].filter((file) => safeRegularPath(root, path.join(root, file)));
  const fullBytes = contextBytes(root, fullFiles);
  const packetBytes = Buffer.byteLength(JSON.stringify(packet));
  const frontierBytes = contextBytes(root, frontierFiles) + packetBytes;
  const reduction = fullBytes > 0
    ? Math.max(0, Math.round((1 - frontierBytes / fullBytes) * 1000) / 10)
    : 0;
  packet.context_budget = {
    metric: "versionable-byte token proxy",
    full_bytes: fullBytes,
    frontier_bytes: frontierBytes,
    reduction_percent: reduction,
    target_percent: 50,
    meets_target: reduction >= 50,
    full_file_count: fullFiles.length,
    frontier_files: [...new Set(frontierFiles)],
  };
  return packet;
}

function explain(root, { path: inputPath, shape = null, compact = false } = {}) {
  const relPath = toRepoPath(root, inputPath);
  if (!relPath)
    return { ok: false, errors: ["explain requires --path <file>"] };

  const kernel = loadKernel(root);
  if (kernel.schemaErrors.length)
    return { ok: false, errors: kernel.schemaErrors };
  const rules = explainRules(kernel.rules, relPath);
  const result = {
    ok: true,
    root: path.resolve(root),
    path: relPath,
    shape,
    kernel_present: Boolean(kernel.facts || kernel.rules),
    facts: explainFacts(kernel.facts, relPath),
    rules,
    guard: explainGuard(kernel.guard, relPath),
    exemplars: explainExemplars(kernel.exemplars, relPath, shape),
    decisions: explainDecisions(root, relPath, rules),
  };
  return compact ? compactResult(root, result) : result;
}

function renderList(items, empty, renderItem) {
  if (!items.length) return [`  ${empty}`];
  return items.flatMap(renderItem);
}

function renderExplain(result) {
  if (!result.ok) return result.errors.join("\n");
  if (result.context_budget) {
    const budget = result.context_budget;
    return [
      `agentlintel context frontier: ${result.path}${result.shape ? ` (${result.shape})` : ""}`,
      `facts: ${result.facts.map((fact) => fact.id).join(", ") || "none"}`,
      `rules: ${result.rules.map((rule) => rule.id).join(", ") || "none"}`,
      `guard: ${result.guard.status}`,
      `exemplars: ${result.exemplars.map((entry) => entry.path).join(", ") || "none"}`,
      `decisions: ${result.decisions.map((entry) => entry.path || entry.id).join(", ") || "none"}`,
      `context: ${budget.frontier_bytes}/${budget.full_bytes} bytes (${budget.reduction_percent}% reduction; target ${budget.target_percent}%)`,
    ].join("\n");
  }

  const lines = [
    `agentlintel explain @ ${result.root}`,
    `  path      ${result.path}`,
    "",
    "rules",
    ...renderList(result.rules, "none", (rule) => [
      `  ${rule.id} (${rule.severity}, ${rule.engine}) - ${rule.why}`,
      ...(rule.adr ? [`    adr ${arrayOf(rule.adr).join(", ")}`] : []),
      ...(rule.layer_note ? [`    ${rule.layer_note}`] : []),
    ]),
    "",
    "guard",
    `  ${result.guard.status} - ${result.guard.note}`,
    ...result.guard.forbidden.map((glob) => `    forbidden ${glob}`),
    ...result.guard.zones.map(
      (zone) => `    zone ${zone.id}: ${zone.matched_allow.join(", ")}`,
    ),
    "",
    "exemplars",
    ...renderList(result.exemplars, "none", (exemplar) => [
      `  ${exemplar.id} (${exemplar.path}) - ${exemplar.why}`,
    ]),
    "",
    "decisions",
    ...renderList(result.decisions, "none", (decision) => [
      `  ${decision.id}${decision.path ? ` ${decision.path}` : ""} - ${decision.why}`,
    ]),
  ];

  return lines.join("\n");
}

module.exports = { explain, renderExplain, toRepoPath };
