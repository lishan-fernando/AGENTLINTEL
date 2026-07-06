// SPDX-License-Identifier: FSL-1.1-ALv2
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const HELP = `agentlintel v2 - deterministic architecture gate for AI-agent codebases

Usage:
  agentlintel init [--dir <root>] [opts]
  agentlintel verify [--dir <root>] [opts]
  agentlintel report [--dir <root>] [opts]
  agentlintel explain --path <file> [--dir <root>] [--json]

init options:
  --pattern <name> vertical-slice (default), layered-3tier, mvvm, custom
  --from-v1  --adapters  --hooks  --engine-adapters  --force

verify/report options:
  --dir <root>  --base <ref>  --diff  --quiet  --bail  --workspace
  --json  --strict  --no-run  --skip-fixtures  --mode warn

explain options:
  --dir <root>  --path <file>  --json

Exit codes: 0 gate passed, 1 gate failed, 2 internal/config error.`;

const VALUE_FLAGS = new Set(["--dir", "--base", "--pattern", "--path", "--mode"]);
const BOOLEAN_FLAGS = {
  "--json": "json",
  "--strict": "strict",
  "--no-run": "noRun",
  "--skip-fixtures": "skipFixtures",
  "--diff": "diff",
  "--quiet": "quiet",
  "--bail": "bail",
  "--workspace": "workspace",
  "--force": "force",
  "--from-v1": "fromV1",
  "--adapters": "adapters",
  "--hooks": "hooks",
  "--engine-adapters": "engineAdapters",
};

function parseArgs(argv) {
  const parsed = { _: [], errors: [] };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (VALUE_FLAGS.has(arg)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed.errors.push(`${arg} requires a value`);
        continue;
      }
      const key = arg
        .slice(2)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      parsed[key] = next;
      index++;
      continue;
    }

    const booleanKey = BOOLEAN_FLAGS[arg];
    if (booleanKey) {
      parsed[booleanKey] = true;
      continue;
    }

    if (arg.startsWith("-")) parsed.errors.push(`Unknown option '${arg}'`);
    else parsed._.push(arg);
  }

  return parsed;
}

function verifyOpts(options) {
  return {
    run: !options.noRun,
    strict: options.strict,
    skipFixtures: options.skipFixtures,
    base: options.base,
    diff: options.diff,
    bail: options.bail,
    mode: options.mode,
  };
}

function hasKernel(root) {
  return (
    fs.existsSync(path.join(root, ".agentlintel", "rules.yaml")) ||
    fs.existsSync(path.join(root, ".agentlintel", "facts.yaml"))
  );
}

function maybeWorkspace(root) {
  const { workspacePath } = require("./lib/workspace");
  return workspacePath(root);
}

function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  const root = path.resolve(options.dir || cwd);

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    console.log(HELP);
    return 0;
  }

  if (options.errors.length) {
    for (const error of options.errors) console.error(error);
    return 2;
  }

  if (options.mode && options.mode !== "warn") {
    console.error(`Unknown --mode '${options.mode}'. Supported: warn`);
    return 2;
  }

  if (options._.length) {
    console.error(
      `Unexpected argument '${options._[0]}'. Run: agentlintel help`,
    );
    return 2;
  }

  if (command === "init") return runInit(root, options);
  if (command === "verify" || command === "report")
    return runVerifyOrReport(command, root, options);
  if (command === "explain") return runExplain(root, options);

  console.error(`Unknown command '${command}'. Run: agentlintel help`);
  return 2;
}

function runExplain(root, options) {
  const { explain, renderExplain } = require("./commands/explain");
  const result = explain(root, { path: options.path });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(renderExplain(result));
  else console.error(renderExplain(result));
  return result.ok ? 0 : 2;
}

function runInit(root, options) {
  const { init } = require("./commands/init");
  const result = init(root, {
    force: options.force,
    fromV1: options.fromV1,
    adapters: options.adapters,
    hooks: options.hooks,
    engineAdapters: options.engineAdapters,
    pattern: options.pattern,
  });

  for (const line of result.log) console.log(line);
  return result.ok ? 0 : 2;
}

function runVerifyOrReport(command, root, options) {
  if (
    options.workspace ||
    (!options.dir && maybeWorkspace(root) && !hasKernel(root))
  ) {
    return runWorkspace(root, command, options);
  }

  const { verify } = require("./lib/verify");
  const result = verify(root, verifyOpts(options));
  printResult(command, options, result);
  return result.ok ? 0 : 1;
}

function runWorkspace(root, command, options) {
  const { loadWorkspace } = require("./lib/workspace");
  const { verify } = require("./lib/verify");
  const workspace = loadWorkspace(root);
  const members = [];
  let ok = workspace.errors.length === 0;

  for (const member of workspace.members) {
    const result = verify(member.abs, verifyOpts(options));
    members.push({ path: member.path, result });
    ok = ok && result.ok;
    if (!result.ok && options.bail) break;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        { workspace: root, ok, errors: workspace.errors, members },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }

  for (const error of workspace.errors)
    console.error(`  FAIL WORKSPACE ${error}`);
  for (const member of members) {
    if (options.quiet && member.result.ok) continue;
    console.log(`\n=== ${member.path} ===`);
    printResult(command, options, member.result);
  }

  const passed = `\nWORKSPACE GATE PASSED (${workspace.members.length} member(s))`;
  console.log(ok ? passed : "\nWORKSPACE GATE FAILED");
  return ok ? 0 : 1;
}

function printResult(command, options, result) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "report") {
    const { renderReport } = require("./commands/report");
    console.log(renderReport(result));
    return;
  }

  if (options.quiet) printQuiet(result);
  else printVerify(result);
}

const QUIET_MAX = 3;

function printQuiet(result) {
  if (result.ok) {
    console.log("agentlintel: GATE PASSED");
    return;
  }

  const issues = result.errors.length
    ? result.errors.map((error) => ["FAIL", error])
    : result.warnings.map((warning) => ["WARN", warning]);

  for (const [kind, message] of issues.slice(0, QUIET_MAX))
    console.log(`${kind} ${message}`);
  if (issues.length > QUIET_MAX) {
    console.log(
      `... +${issues.length - QUIET_MAX} more issue(s). Run 'agentlintel verify' for the full list.`,
    );
  }
  console.log(
    "agentlintel: GATE FAILED - fix the failure(s) above before finishing.",
  );
}

function printVerify(result) {
  const freshFacts = result.facts.filter((fact) => fact.ok).length;
  const pendingFacts = result.facts.filter((fact) => fact.pending).length;
  const greenFixtures = result.fixtures.filter((fixture) => fixture.ok).length;
  const activeViolations = result.rule_violations.filter(
    (violation) => !violation.exempted,
  ).length;
  const dormantRules = (result.dormant_rules || []).length;

  console.log(
    `agentlintel verify @ ${result.root}${result.mode === "diff" ? " (diff mode)" : ""}${result.advisory_mode === "warn" ? " (warn mode)" : ""}`,
  );
  console.log(
    `  facts     ${freshFacts}/${result.facts.length} fresh${pendingFacts ? ` (${pendingFacts} pending)` : ""}`,
  );
  console.log(
    `  rules     ${activeViolations} violation(s)${result.exempted_count ? ` (+${result.exempted_count} exempted)` : ""}${dormantRules ? `, ${dormantRules} dormant (must_match: false)` : ""}`,
  );
  console.log(`  fixtures  ${greenFixtures}/${result.fixtures.length} green`);
  console.log(
    `  guard     ${result.guard.status}${result.guard.violations.length ? `, ${result.guard.violations.length} violation(s)` : ""}`,
  );
  console.log(
    `  exemplars ${result.exemplars.filter((exemplar) => exemplar.ok).length}/${result.exemplars.length} present`,
  );

  for (const error of result.errors) console.log(`  FAIL ${error}`);
  for (const warning of result.warnings) console.log(`  warn ${warning}`);
  console.log(result.ok ? "GATE PASSED" : "GATE FAILED");
}

module.exports = {
  HELP,
  main,
  parseArgs,
  printQuiet,
  printVerify,
  verifyOpts,
};
