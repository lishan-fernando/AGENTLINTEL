// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const path = require("node:path");
const {
  prepareStrictGate,
  verifyStrictGate,
  applyStrictGate,
} = require("../lib/strict-gate");

function renderTiming(timing) {
  if (!timing) return [];
  const slowest = timing.slowestCommands.slice(0, 10);
  return [
    "timing (slowest commands)",
    ...slowest.map((item) =>
      `  ${item.elapsedMs}ms ${item.stage}/${item.id} (${item.cacheStatus})`),
  ];
}

function renderResult(result) {
  if (result.phase === "prepare")
    return [
      "strict gate prepared",
      `  plan   ${result.path}`,
      `  source ${result.plan.binding.heads.sourceHead}`,
      `  target ${result.plan.binding.heads.targetHead}`,
    ].join("\n");
  if (result.phase === "apply")
    return [
      "strict gate applied atomically",
      `  target ${result.receipt.targetRef}`,
      `  head   ${result.receipt.appliedHead}`,
      `  time   ${result.receipt.elapsedMs}ms`,
      `  receipt ${result.path}`,
    ].join("\n");
  return [
    result.ok ? "strict gate verified" : "strict gate failed",
    ...(result.path ? [`  bundle ${result.path}`] : []),
    ...renderTiming(result.timing),
  ].join("\n");
}

async function runGate(root, options) {
  const phase = options._[0];
  if (!phase || !["prepare", "verify", "apply"].includes(phase)) {
    console.error("gate requires one phase: prepare, verify, or apply");
    return 2;
  }
  if (options._.length !== 1) {
    console.error(`Unexpected argument '${options._[1]}'. Run: agentlintel help`);
    return 2;
  }
  if (!options.config) {
    console.error("gate requires --config <file>");
    return 2;
  }
  const phaseOptions = {
    prepare: new Set(["dir", "config", "output", "json"]),
    verify: new Set(["dir", "config", "plan", "output", "workers", "heartbeatMs", "json"]),
    apply: new Set(["dir", "config", "bundle", "output", "json"]),
  }[phase];
  const inapplicable = Object.keys(options).find((key) =>
    !["_", "errors"].includes(key) && !phaseOptions.has(key));
  if (inapplicable) {
    const flag = inapplicable.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    console.error(`Option '--${flag}' does not apply to 'gate ${phase}'`);
    return 2;
  }

  try {
    let result;
    if (phase === "prepare") {
      result = prepareStrictGate(root, options.config, options.output);
    } else if (phase === "verify") {
      if (!options.plan) {
        console.error("gate verify requires --plan <file>");
        return 2;
      }
      result = await verifyStrictGate(root, options.config, options.plan, {
        outputPath: options.output,
        workers: options.workers,
        heartbeatMs: options.heartbeatMs,
        onProgress: (event) => console.error(JSON.stringify(event)),
      });
    } else {
      if (!options.bundle) {
        console.error("gate apply requires --bundle <file>");
        return 2;
      }
      result = applyStrictGate(root, options.config, options.bundle, options.output);
    }

    if (options.json) console.log(JSON.stringify(result));
    else console.log(renderResult({
      ...result,
      path: result.path ? path.relative(root, result.path) || result.path : null,
    }));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(`strict gate ${phase} failed: ${error.message || error}`);
    return 2;
  }
}

module.exports = { runGate, renderResult, renderTiming };
