// SPDX-License-Identifier: FSL-1.1-ALv2
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
  const match = String(fileName).match(/^(ADR-\d+)(?:-|\.md$)/i);
  return match ? match[1].toUpperCase() : null;
}

function decisionIndex(root) {
  const dir = path.join(root, KERNEL_DIR, "decisions");
  const index = new Map();
  if (!fs.existsSync(dir)) return index;

  for (const fileName of fs.readdirSync(dir).sort()) {
    const id = decisionIdFromFile(fileName);
    if (!id) continue;
    const relPath = `${KERNEL_DIR}/decisions/${fileName}`;
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

  const forbidden = (guard.forbidden || []).filter((glob) =>
    matchGlob(glob, relPath),
  );
  const zones = (guard.zones || [])
    .map((zone) => ({
      id: zone.id,
      matched_allow: (zone.allow || []).filter((glob) => matchGlob(glob, relPath)),
    }))
    .filter((zone) => zone.matched_allow.length);

  const allowGlobs = (guard.zones || []).flatMap((zone) => zone.allow || []);
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

function explainExemplars(exemplarsDoc, relPath) {
  const exemplars = Array.isArray(exemplarsDoc && exemplarsDoc.exemplars)
    ? exemplarsDoc.exemplars
    : [];
  return exemplars
    .filter((exemplar) => {
      const exemplarPath = String(exemplar.path || "").replace(/\\/g, "/");
      return relPath === exemplarPath || relPath.startsWith(`${exemplarPath}/`);
    })
    .map((exemplar) => ({
      id: exemplar.id,
      path: exemplar.path,
      shape: exemplar.shape,
      why: "path is inside this registered exemplar",
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

function explain(root, { path: inputPath } = {}) {
  const relPath = toRepoPath(root, inputPath);
  if (!relPath)
    return { ok: false, errors: ["explain requires --path <file>"] };

  const kernel = loadKernel(root);
  const rules = explainRules(kernel.rules, relPath);
  return {
    ok: true,
    root: path.resolve(root),
    path: relPath,
    kernel_present: Boolean(kernel.facts || kernel.rules),
    rules,
    guard: explainGuard(kernel.guard, relPath),
    exemplars: explainExemplars(kernel.exemplars, relPath),
    decisions: explainDecisions(root, relPath, rules),
  };
}

function renderList(items, empty, renderItem) {
  if (!items.length) return [`  ${empty}`];
  return items.flatMap(renderItem);
}

function renderExplain(result) {
  if (!result.ok) return result.errors.join("\n");

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
