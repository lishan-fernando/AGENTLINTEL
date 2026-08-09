// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

function normalizedMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim();
}

function violationKey(violation, file = violation.file) {
  const message = normalizedMessage(violation.message);
  const identityFile = violation.line === 0 &&
      message.startsWith("Required architecture evidence not found:")
    ? "(rule-scope)"
    : String(file || "").replace(/\\/g, "/");
  return JSON.stringify([
    violation.rule,
    identityFile,
    message,
  ]);
}

function parseRenameMap(output) {
  const entries = String(output || "").split("\0").filter(Boolean);
  const renames = new Map();
  for (let index = 0; index < entries.length;) {
    const status = entries[index++];
    if (/^[RC]\d*$/.test(status)) {
      const before = entries[index++];
      const after = entries[index++];
      if (before && after) renames.set(after, before);
    } else {
      index++;
    }
  }
  return renames;
}

function applyViolationBaseline(
  currentViolations,
  baselineViolations,
  ruleIds,
  renameMap = new Map(),
) {
  const baselineCounts = new Map();
  for (const violation of baselineViolations) {
    if (!ruleIds.has(violation.rule)) continue;
    const key = violationKey(violation);
    baselineCounts.set(key, (baselineCounts.get(key) || 0) + 1);
  }

  let legacy = 0;
  let introduced = 0;
  let exemptedIntroduced = 0;
  for (const violation of currentViolations) {
    if (!ruleIds.has(violation.rule)) continue;
    const baselinePath = renameMap.get(violation.file) || violation.file;
    const key = violationKey(violation, baselinePath);
    const available = baselineCounts.get(key) || 0;
    if (available > 0) {
      violation.legacy = true;
      baselineCounts.set(key, available - 1);
      legacy++;
    } else {
      violation.introduced = true;
      if (violation.exempted) exemptedIntroduced++;
      else introduced++;
    }
  }

  const resolved = [...baselineCounts.values()].reduce((sum, count) => sum + count, 0);
  return { legacy, introduced, exempted_introduced: exemptedIntroduced, resolved };
}

module.exports = {
  applyViolationBaseline,
  parseRenameMap,
  violationKey,
};
