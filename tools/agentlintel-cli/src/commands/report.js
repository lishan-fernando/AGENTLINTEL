// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

function renderReport(result) {
  const lines = [];
  const freshFacts = result.facts.filter((fact) => fact.ok).length;
  const activeViolations = result.rule_violations.filter(
    (violation) => !violation.exempted,
  ).length;
  const greenFixtures = result.fixtures.filter((fixture) => fixture.ok).length;
  const presentExemplars = result.exemplars.filter(
    (exemplar) => exemplar.ok,
  ).length;
  const dormantRules = (result.dormant_rules || []).length;

  lines.push("# agentlintel report");
  lines.push("");
  lines.push(
    `Root: \`${result.root}\` - **${result.ok ? "GATE PASSED" : "GATE FAILED"}**`,
  );
  lines.push("");
  lines.push("| Section | Result |");
  lines.push("|---|---|");
  lines.push(`| Facts | ${freshFacts}/${result.facts.length} fresh |`);
  lines.push(
    `| Rules | ${activeViolations} violation(s)${result.exempted_count ? ` (+${result.exempted_count} exempted)` : ""}${dormantRules ? `, ${dormantRules} dormant` : ""} |`,
  );
  lines.push(`| Fixtures | ${greenFixtures}/${result.fixtures.length} green |`);
  lines.push(
    `| Guard | ${result.guard.status}${result.guard.violations.length ? `, ${result.guard.violations.length} violation(s)` : ""} |`,
  );
  if (result.ratchet)
    lines.push(
      `| Ratchet | ${result.ratchet.status}${result.ratchet.ok ? "" : ", ADR required"} |`,
    );
  lines.push(
    `| Exemplars | ${presentExemplars}/${result.exemplars.length} present |`,
  );

  const steps = nextSteps(result);
  if (steps.length) {
    lines.push("");
    lines.push("## Next Steps");
    lines.push("");
    for (const step of steps) lines.push(`- ${step}`);
  }

  if (result.errors.length) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const error of result.errors) lines.push(`- ${error}`);
  }

  if (result.warnings.length) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }

  if (result.facts.length) {
    lines.push("");
    lines.push("## Facts");
    lines.push("");
    lines.push("| Fact | Status |");
    lines.push("|---|---|");
    for (const fact of result.facts) {
      const status = fact.ok
        ? "fresh"
        : fact.pending
          ? `PENDING - ${fact.detail}`
          : `STALE - ${fact.detail}`;
      lines.push(`| ${tableCell(fact.claim)} | ${tableCell(status)} |`);
    }
  }

  return lines.join("\n");
}

function tableCell(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function nextSteps(result) {
  const steps = [];
  const addStep = (step) => {
    if (!steps.includes(step)) steps.push(step);
  };

  const facts = result.facts || [];
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  const fixtures = result.fixtures || [];
  const guard = result.guard || { violations: [] };
  const violations = result.rule_violations || [];

  if (result.kernel_present === false) {
    addStep(
      "Run `agentlintel init`, then commit the generated `.agentlintel/` kernel.",
    );
  }

  if (facts.some((fact) => !fact.ok && !fact.pending)) {
    addStep(
      "Refresh stale facts: make the checked claim true, update its machine check, move intent to an ADR, or delete the claim.",
    );
  }

  if (facts.some((fact) => fact.pending)) {
    addStep(
      "Resolve pending facts before strict CI: replace `type: pending` with a machine check, move the claim to an ADR, or delete it.",
    );
  }

  if (violations.some((violation) => !violation.exempted)) {
    addStep(
      "Fix rule violations in code, or add a bounded `AGENTLINTEL-EXEMPT` block with Reason, Approver, Expires, and Owner.",
    );
  }

  if (fixtures.some((fixture) => !fixture.ok)) {
    addStep(
      "Repair conformance fixtures with the rule change; every rule needs passing and failing evidence.",
    );
  }

  if ((guard.violations || []).length) {
    addStep(
      "Keep the diff inside `guard.json` write zones, or change the guard through the normal reviewed governance path.",
    );
  }

  if (result.ratchet && !result.ratchet.ok) {
    addStep(
      "Rule weakening requires an append-only ADR in `.agentlintel/decisions/` in the same diff.",
    );
  }

  if ((result.exemplars || []).some((exemplar) => !exemplar.ok)) {
    addStep(
      "Restore missing exemplar paths or update `exemplars.yaml` to point at a real canonical implementation.",
    );
  }

  if (
    (result.adapters || []).some((adapter) => !adapter.ok) ||
    errors.some((error) => error.includes("ADAPTER"))
  ) {
    addStep(
      "Regenerate drifted adapter or hook pointer files with `agentlintel init --adapters --hooks --force`; keep them content-free.",
    );
  }

  if (errors.some((error) => error.includes("ENGINE"))) {
    addStep(
      "Install or repair the external engine command; AgentLintel fails closed when an engine cannot run cleanly.",
    );
  }

  if (warnings.some((warning) => warning.includes("GUARD-BASE"))) {
    addStep(
      "CI should pass `--base <ref>` or use a checkout with enough history so guard checks the actual PR diff.",
    );
  }

  if (warnings.some((warning) => warning.includes("RULE-SCOPE"))) {
    addStep(
      "Fix empty rule scopes, set `must_match: true` once paths exist, or declare scaffold-only rules with `must_match: false`.",
    );
  }

  if ((result.dormant_rules || []).length) {
    addStep(
      "Dormant rules (`must_match: false`, zero scope matches) enforce nothing yet: flip them to `must_match: true` once their paths exist in the tree.",
    );
  }

  if (warnings.length && !errors.length) {
    addStep(
      "Warnings pass locally but fail under `--strict`; clear them before enabling the merge gate.",
    );
  }

  return steps;
}

module.exports = {
  renderReport,
  nextSteps,
  tableCell,
};
