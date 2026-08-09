// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const {
  runRule,
  requiredRegexViolations,
  collectExemptionSpans,
  layerOfPath,
} = require("./engines");

function annotate(rule, violations) {
  if (!rule || !rule.adr) return violations;
  for (const violation of violations)
    if (!violation.adr) violation.adr = rule.adr;
  return violations;
}

function scanRuleEntries(rules, entries, options = {}) {
  const violations = [];
  const spans = [];
  const scansFile = options.scansFile;
  const exemptionRule = rules.find((rule) => rule.engine === "exemptions");
  const ruleFileCounts = new Map(rules.map((rule) => [rule.id, 0]));
  const requiredEntries = new Map(
    rules
      .filter((rule) => rule.engine === "regex" && rule._requiredRegexes.length)
      .map((rule) => [rule.id, []]),
  );

  for (const { filePath, content } of entries) {
    const applicable = rules.filter((rule) => scansFile(rule, filePath));
    for (const rule of applicable) {
      if (rule.engine !== "layers" || layerOfPath(rule.layers || [], filePath))
        ruleFileCounts.set(rule.id, ruleFileCounts.get(rule.id) + 1);
      violations.push(...annotate(
        rule,
        runRule(rule, filePath, content, { skipApplies: true }),
      ));
      if (requiredEntries.has(rule.id))
        requiredEntries.get(rule.id).push({ filePath, content });
    }

    if (exemptionRule && content.includes(exemptionRule._marker) &&
        scansFile(exemptionRule, filePath))
      spans.push(...collectExemptionSpans(exemptionRule, filePath, content, {
        skipApplies: true,
      }));
  }

  if (!options.partial)
    for (const rule of rules)
      if (requiredEntries.has(rule.id))
        violations.push(...annotate(
          rule,
          requiredRegexViolations(rule, requiredEntries.get(rule.id), {
            baselineEntries: options.baselineEntries
              ? options.baselineEntries(rule)
              : [],
          }),
        ));

  return { violations, spans, ruleFileCounts };
}

module.exports = { scanRuleEntries };
