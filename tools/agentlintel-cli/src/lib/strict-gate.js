// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { matchAny } = require("./io");
const { safeRegularRepoFile } = require("./safe-paths");

const PLAN_SCHEMA = "agentlintel.strict-plan/v1";
const BUNDLE_SCHEMA = "agentlintel.verification-bundle/v1";
const RECEIPT_SCHEMA = "agentlintel.apply-receipt/v1";
const DEFAULT_RUNTIME = ".agentlintel/runtime";
const DEFAULT_HEARTBEAT_MS = 15000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const TRANSIENT_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const CACHE_CATEGORIES = new Set([
  "restore",
  "release-build",
  "openapi",
  "contract-evidence",
  "git-proofs",
  "architecture-compilation",
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function digest(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(stable(value)));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function slash(value) {
  return String(value).replace(/\\/g, "/");
}

function canonicalRepoPath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw new Error(`${label} must be a non-empty repository-relative path`);
  const normalized = slash(path.posix.normalize(slash(value))).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." ||
      normalized.startsWith("../") || path.posix.isAbsolute(normalized))
    throw new Error(`${label} must stay inside the repository: ${value}`);
  return normalized;
}

function inside(root, relPath, label = "path") {
  const rel = canonicalRepoPath(relPath, label);
  const absolute = path.resolve(root, ...rel.split("/"));
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`${label} must stay inside the repository: ${relPath}`);
  return { rel, absolute };
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function renameSyncWithRetry(source, destination, options = {}) {
  const rename = options.rename || fs.renameSync;
  const sleep = options.sleep || sleepSync;
  const maxAttempts = options.maxAttempts || 8;
  for (let attempt = 1; ; attempt += 1) {
    try {
      rename(source, destination);
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !TRANSIENT_RENAME_CODES.has(error && error.code))
        throw error;
      sleep(Math.min(10 * (2 ** (attempt - 1)), 250));
    }
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try {
    renameSyncWithRetry(temp, filePath);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function readJson(root, inputPath, label) {
  const absolute = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) ||
      !safeRegularRepoFile(root, absolute))
    throw new Error(`${label} must be a regular file inside the repository`);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message || error}`);
  }
  return { value, absolute, relative: slash(relative) };
}

function git(root, args, { allowFailure = false, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "git command failed").trim();
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result;
}

function validRef(ref) {
  return typeof ref === "string" && ref.length > 0 && !ref.startsWith("-") &&
    !ref.includes("\0") && !ref.includes("@{");
}

function resolveCommit(root, ref, label) {
  if (!validRef(ref)) throw new Error(`${label} is unsafe`);
  const result = git(root, [
    "rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`,
  ], { allowFailure: true });
  const commit = String(result.stdout || "").trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(commit))
    throw new Error(`${label} does not resolve to a commit: ${ref}`);
  return commit.toLowerCase();
}

function validateTargetRef(ref) {
  if (typeof ref !== "string" || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(ref) ||
      ref.includes("..") || ref.includes("//") || ref.endsWith("/"))
    throw new Error("targetRef must be an exact refs/heads/<branch> reference");
  return ref;
}

function gitTreeFiles(root, commit) {
  const result = git(root, ["ls-tree", "-r", "--name-only", "-z", commit]);
  return result.stdout.split("\0").filter(Boolean).map(slash).sort();
}

function gitBlob(root, commit, file) {
  const result = spawnSync("git", ["show", "--end-of-options", `${commit}:${file}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0)
    throw new Error(`could not read committed evidence: ${file}`);
  return result.stdout;
}

function digestCommittedPatterns(root, commit, patterns, label) {
  if (!Array.isArray(patterns) || !patterns.length)
    throw new Error(`${label} must contain at least one path or glob`);
  const normalized = patterns.map((pattern, index) =>
    canonicalRepoPath(pattern, `${label}[${index}]`));
  const files = gitTreeFiles(root, commit);
  const entries = [];
  for (const pattern of normalized) {
    const matches = files.filter((file) => matchAny([pattern], file));
    if (!matches.length) throw new Error(`${label} pattern matched no committed file: ${pattern}`);
    for (const file of matches) {
      if (entries.some((entry) => entry.path === file)) continue;
      entries.push({ path: file, sha256: digest(gitBlob(root, commit, file)) });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { digest: digest(entries), files: entries };
}

function commandIdentity(command) {
  return digest({
    run: command.run,
    cwd: command.cwd,
    stage: command.stage,
    cache: command.cache,
    cleanCheckout: command.cleanCheckout,
  });
}

function buildExecutionGraph(config) {
  const nodes = [];
  const stages = [];
  const groups = new Map();
  let ordinal = 0;
  let previousStage = null;
  for (const stage of [...new Set(config.commands.map((command) => command.stage))]) {
    const stageCommands = config.commands.filter((command) => command.stage === stage);
    const seen = new Map();
    const stageNodes = [];
    for (const command of stageCommands) {
      const identity = commandIdentity(command);
      const deduplicatedFrom = command.final ? null : seen.get(identity) || null;
      if (!deduplicatedFrom) seen.set(identity, command.id);
      const node = {
        ordinal: ++ordinal,
        id: command.id,
        stage,
        project: command.project,
        case: command.case,
        rule: command.rule,
        operation: command.cache?.category || (command.final ? "final-strict" : "command"),
        identity,
        executes: !deduplicatedFrom,
        deduplicatedFrom,
        cacheable: Boolean(command.cache),
        final: command.final,
        workspaceRequirement: command.cleanCheckout ? "clean-checkout" : "shared-eligible",
      };
      nodes.push(node);
      stageNodes.push(command.id);
      const group = groups.get(identity) || [];
      group.push(node);
      groups.set(identity, group);
    }
    stages.push({
      id: stage,
      index: stages.length + 1,
      dependsOn: previousStage ? [previousStage] : [],
      nodes: stageNodes,
    });
    previousStage = stage;
  }
  const operationCounts = {};
  for (const node of nodes) {
    const count = operationCounts[node.operation] || { declared: 0, executed: 0, deduplicated: 0 };
    count.declared++;
    if (node.executes) count.executed++;
    else count.deduplicated++;
    operationCounts[node.operation] = count;
  }
  const repeatedOperations = [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([identity, group]) => ({
      identity,
      commands: group.map((node) => node.id),
      executedAs: group.filter((node) => node.executes).map((node) => node.id),
      deduplicated: group.filter((node) => !node.executes).map((node) => node.id),
    }));
  return {
    configuredWorkers: config.workers,
    stages,
    nodes,
    repeatedOperations,
    operationCounts,
    summary: {
      declaredCommands: nodes.length,
      executedCommands: nodes.filter((node) => node.executes).length,
      deduplicatedCommands: nodes.filter((node) => !node.executes).length,
      requiredCleanCheckouts: nodes.filter((node) =>
        node.executes && node.workspaceRequirement === "clean-checkout").length,
    },
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("strict-gate config must be a JSON object");
  if (raw.version !== 1) throw new Error("strict-gate config version must be 1");
  const sourceRef = raw.sourceRef || "HEAD";
  if (!validRef(sourceRef)) throw new Error("sourceRef is unsafe");
  const targetRef = validateTargetRef(raw.targetRef);
  const runtimeDir = canonicalRepoPath(raw.runtimeDir || DEFAULT_RUNTIME, "runtimeDir");
  const workers = raw.workers == null ? (process.platform === "win32" ? 1 : 1) : raw.workers;
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 32)
    throw new Error("workers must be an integer from 1 to 32");
  const heartbeatMs = raw.heartbeatMs == null ? DEFAULT_HEARTBEAT_MS : raw.heartbeatMs;
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 100 || heartbeatMs > 300000)
    throw new Error("heartbeatMs must be an integer from 100 to 300000");

  const list = (name) => {
    if (!Array.isArray(raw[name]) || !raw[name].length)
      throw new Error(`${name} must contain at least one committed path or glob`);
    return raw[name].map((value, index) => canonicalRepoPath(value, `${name}[${index}]`));
  };
  const tools = Array.isArray(raw.tools) ? raw.tools.map((tool, index) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool) ||
        typeof tool.id !== "string" || !tool.id ||
        typeof tool.run !== "string" || !tool.run.trim())
      throw new Error(`tools[${index}] requires non-empty id and run strings`);
    return { id: tool.id, run: tool.run.trim(), timeoutMs: tool.timeoutMs || 30000 };
  }) : [];
  if (!tools.length) throw new Error("tools must contain at least one version probe");
  for (const tool of tools)
    if (!Number.isSafeInteger(tool.timeoutMs) || tool.timeoutMs < 1 || tool.timeoutMs > 300000)
      throw new Error(`tool '${tool.id}' timeoutMs is invalid`);

  if (!Array.isArray(raw.commands) || !raw.commands.length)
    throw new Error("commands must contain at least one strict-gate command");
  const ids = new Set();
  const commands = raw.commands.map((command, index) => {
    if (!command || typeof command !== "object" || Array.isArray(command))
      throw new Error(`commands[${index}] must be an object`);
    if (typeof command.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(command.id) ||
        ids.has(command.id))
      throw new Error(`commands[${index}] has a missing, unsafe, or duplicate id`);
    ids.add(command.id);
    if (typeof command.stage !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(command.stage))
      throw new Error(`command '${command.id}' has an unsafe stage`);
    if (typeof command.run !== "string" || !command.run.trim() || command.run.includes("\0"))
      throw new Error(`command '${command.id}' requires a non-empty run string`);
    const timeoutMs = command.timeoutMs || 30 * 60 * 1000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 24 * 60 * 60 * 1000)
      throw new Error(`command '${command.id}' timeoutMs is invalid`);
    const cwd = command.cwd ? canonicalRepoPath(command.cwd, `command '${command.id}' cwd`) : ".";
    const rule = command.rule == null ? null : String(command.rule);
    if (rule != null && !/^[a-z0-9][a-z0-9._-]*$/i.test(rule))
      throw new Error(`command '${command.id}' has an unsafe rule id`);
    let cache = null;
    if (command.cache != null) {
      if (!command.cache || typeof command.cache !== "object" || Array.isArray(command.cache) ||
          !CACHE_CATEGORIES.has(command.cache.category))
        throw new Error(`command '${command.id}' cache.category is unsupported`);
      if (!Array.isArray(command.cache.inputs) || !command.cache.inputs.length ||
          !Array.isArray(command.cache.outputs) || !command.cache.outputs.length)
        throw new Error(`command '${command.id}' cache requires inputs and outputs`);
      cache = {
        category: command.cache.category,
        inputs: command.cache.inputs.map((value, itemIndex) =>
          canonicalRepoPath(value, `command '${command.id}' cache.inputs[${itemIndex}]`)),
        outputs: command.cache.outputs.map((value, itemIndex) =>
          canonicalRepoPath(value, `command '${command.id}' cache.outputs[${itemIndex}]`)),
      };
    }
    if (command.final && cache)
      throw new Error(`final strict command '${command.id}' must run and cannot be cached`);
    return {
      id: command.id,
      stage: command.stage,
      run: command.run.trim(),
      cwd,
      project: command.project || command.id,
      case: command.case || command.id,
      rule,
      timeoutMs,
      final: Boolean(command.final),
      cleanCheckout: Boolean(command.cleanCheckout),
      cache,
    };
  });
  const firstFinal = commands.findIndex((command) => command.final);
  if (firstFinal < 0) throw new Error("commands must include at least one final: true strict gate");
  if (commands.slice(firstFinal).some((command) => !command.final))
    throw new Error("all final strict commands must be the last commands in the plan");
  if (commands.slice(0, firstFinal).some((command) =>
      command.stage === commands[firstFinal].stage))
    throw new Error("final strict commands must use a stage after every non-final command");
  const closedStages = new Set();
  let activeStage = null;
  for (const command of commands) {
    if (command.stage === activeStage) continue;
    if (closedStages.has(command.stage))
      throw new Error(`stage '${command.stage}' must be one contiguous command group`);
    if (activeStage) closedStages.add(activeStage);
    activeStage = command.stage;
  }

  return {
    version: 1,
    sourceRef,
    targetRef,
    runtimeDir,
    workers,
    heartbeatMs,
    tools,
    packages: list("packages"),
    authorization: list("authorization"),
    sourceProofs: list("sourceProofs"),
    commands,
  };
}

function toolProofs(root, tools) {
  return tools.map((tool) => {
    const result = spawnSync(tool.run, {
      cwd: root,
      shell: true,
      timeout: tool.timeoutMs,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0)
      throw new Error(`tool probe '${tool.id}' failed with exit ${result.status}`);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return {
      id: tool.id,
      run: tool.run,
      outputSha256: digest(output),
      output,
    };
  });
}

function buildBinding(root, config, configDigest) {
  const sourceHead = resolveCommit(root, config.sourceRef, "sourceRef");
  const targetHead = resolveCommit(root, config.targetRef, "targetRef");
  const ancestor = git(root, ["merge-base", "--is-ancestor", targetHead, sourceHead], {
    allowFailure: true,
  });
  if (ancestor.status !== 0)
    throw new Error("sourceRef must descend from targetRef for atomic fast-forward apply");
  const repository = git(root, ["rev-parse", "--show-toplevel"]).stdout.trim();
  const remote = git(root, ["config", "--get", "remote.origin.url"], {
    allowFailure: true,
  }).stdout.trim();
  const tools = toolProofs(root, config.tools);
  const binding = {
    repository: { root: path.resolve(repository), remote: remote || null },
    heads: { sourceRef: config.sourceRef, sourceHead, targetRef: config.targetRef, targetHead },
    configDigest,
    planDigest: null,
    toolDigest: digest(tools),
    tools,
    packageProof: digestCommittedPatterns(root, sourceHead, config.packages, "packages"),
    authorizationProof: digestCommittedPatterns(root, sourceHead, config.authorization, "authorization"),
    sourceProof: digestCommittedPatterns(root, sourceHead, config.sourceProofs, "sourceProofs"),
  };
  return binding;
}

function runtimePaths(root, config) {
  const runtime = inside(root, config.runtimeDir, "runtimeDir").absolute;
  return {
    runtime,
    plans: path.join(runtime, "plans"),
    bundles: path.join(runtime, "bundles"),
    receipts: path.join(runtime, "receipts"),
    caches: path.join(runtime, "cache"),
    workspaces: path.join(runtime, "workspaces"),
    ownership: path.join(runtime, "ownership"),
  };
}

function prepareStrictGate(root, configPath, outputPath = null) {
  const loaded = readJson(root, configPath, "strict-gate config");
  const config = normalizeConfig(loaded.value);
  const configDigest = digest(fs.readFileSync(loaded.absolute));
  const binding = buildBinding(root, config, configDigest);
  const planCore = {
    schema: PLAN_SCHEMA,
    configPath: loaded.relative,
    config,
    binding,
    executionGraph: buildExecutionGraph(config),
  };
  const planDigest = digest(planCore);
  planCore.binding.planDigest = planDigest;
  const plan = { ...planCore, digest: digest(planCore) };
  const paths = runtimePaths(root, config);
  const output = outputPath
    ? inside(root, outputPath, "plan output").absolute
    : path.join(paths.plans, `${plan.digest}.json`);
  atomicWriteJson(output, plan);
  return { ok: true, phase: "prepare", plan, path: output };
}

function verifySignedObject(value, schema, label) {
  if (!value || value.schema !== schema || typeof value.digest !== "string")
    throw new Error(`${label} has an unsupported schema`);
  const { digest: claimed, ...core } = value;
  if (digest(core) !== claimed) throw new Error(`${label} digest does not match its content`);
  return value;
}

function sameBinding(left, right) {
  return digest(left) === digest(right);
}

function ownerFile(paths, workspaceKey) {
  return path.join(paths.ownership, `${workspaceKey}.json`);
}

function registeredWorktree(root, workspace) {
  const output = git(root, ["worktree", "list", "--porcelain"]).stdout;
  return output.split(/\r?\n\r?\n/).some((entry) => {
    const line = entry.split(/\r?\n/).find((item) => item.startsWith("worktree "));
    return line && path.resolve(line.slice(9)) === path.resolve(workspace);
  });
}

function assertOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead) {
  const relative = path.relative(paths.workspaces, workspace);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("refusing to clean a workspace outside the strict-gate runtime");
  const marker = ownerFile(paths, workspaceKey);
  if (!fs.existsSync(marker)) throw new Error("workspace ownership marker is missing");
  const owner = JSON.parse(fs.readFileSync(marker, "utf8"));
  if (path.resolve(owner.repository) !== path.resolve(root) ||
      path.resolve(owner.workspace) !== path.resolve(workspace) ||
      owner.sourceHead !== sourceHead)
    throw new Error("workspace ownership marker does not match the cleanup target");
  if (!registeredWorktree(root, workspace))
    throw new Error("workspace is not a registered Git worktree");
  return marker;
}

function cleanOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead) {
  assertOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead);
  git(workspace, ["reset", "--hard", sourceHead]);
  git(workspace, ["clean", "-ffdx"]);
}

function removeOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead) {
  const marker = assertOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead);
  git(root, ["worktree", "remove", "--force", workspace]);
  fs.unlinkSync(marker);
}

function ensureWorkspace(root, paths, sourceHead, workspaceKey) {
  const workspace = path.join(paths.workspaces, workspaceKey);
  const marker = ownerFile(paths, workspaceKey);
  fs.mkdirSync(paths.workspaces, { recursive: true });
  fs.mkdirSync(paths.ownership, { recursive: true });
  if (fs.existsSync(workspace)) {
    cleanOwnedWorkspace(root, paths, workspace, workspaceKey, sourceHead);
    return workspace;
  }
  if (fs.existsSync(marker))
    throw new Error("orphaned workspace marker exists; refusing an ambiguous cleanup");
  git(root, ["worktree", "add", "--detach", "--force", workspace, sourceHead]);
  try {
    atomicWriteJson(marker, {
      repository: path.resolve(root),
      workspace: path.resolve(workspace),
      sourceHead,
    });
  } catch (error) {
    git(root, ["worktree", "remove", "--force", workspace], { allowFailure: true });
    throw error;
  }
  return workspace;
}

function walkRegularFiles(root, current = root, skipAbsolute = null) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (skipAbsolute && path.resolve(absolute) === path.resolve(skipAbsolute)) continue;
    if (entry.name === ".git") continue;
    if (entry.isSymbolicLink()) throw new Error(`symlinked cache evidence is forbidden: ${absolute}`);
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      files.push(...walkRegularFiles(root, absolute, skipAbsolute));
    } else if (entry.isFile()) {
      files.push(slash(path.relative(root, absolute)));
    } else {
      throw new Error(`non-regular cache evidence is forbidden: ${absolute}`);
    }
  }
  return files;
}

function digestWorkspacePatterns(workspace, patterns, runtimeInWorkspace = null) {
  const listed = git(workspace, [
    "ls-files", "-z", "--cached", "--others", "--exclude-standard",
  ]).stdout.split("\0").filter(Boolean).map(slash);
  const files = [...new Set(listed)].filter((file) => {
    const absolute = path.join(workspace, file);
    if (runtimeInWorkspace && path.resolve(absolute).startsWith(path.resolve(runtimeInWorkspace)))
      return false;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`symlinked cache evidence is forbidden: ${file}`);
    return stat.isFile();
  }).sort();
  const entries = [];
  for (const pattern of patterns) {
    const matches = files.filter((file) => matchAny([pattern], file));
    if (!matches.length) throw new Error(`cache input matched no file: ${pattern}`);
    for (const file of matches) {
      if (entries.some((entry) => entry.path === file)) continue;
      entries.push({ path: file, sha256: digest(fs.readFileSync(path.join(workspace, file))) });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { digest: digest(entries), files: entries };
}

function outputManifest(workspace, outputs) {
  const entries = [];
  for (const output of outputs) {
    const target = inside(workspace, output, "cache output").absolute;
    if (!fs.existsSync(target)) throw new Error(`cache output was not produced: ${output}`);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`cache output must not be a symlink: ${output}`);
    if (stat.isFile()) {
      entries.push({ path: output, type: "file", sha256: digest(fs.readFileSync(target)) });
    } else if (stat.isDirectory()) {
      for (const file of walkRegularFiles(target).sort()) {
        entries.push({
          path: slash(path.posix.join(output, file)),
          type: "file",
          sha256: digest(fs.readFileSync(path.join(target, file))),
        });
      }
      entries.push({ path: output, type: "directory" });
    } else {
      throw new Error(`cache output must be a regular file or directory: ${output}`);
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { digest: digest(entries), entries };
}

function safeRemoveWithin(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("refusing to remove a broad or unrelated path");
  fs.rmSync(target, { recursive: true, force: true });
}

function copyOutput(sourceRoot, destinationRoot, output) {
  const source = inside(sourceRoot, output, "cached output").absolute;
  const destination = inside(destinationRoot, output, "restored output").absolute;
  if (fs.existsSync(destination)) safeRemoveWithin(destinationRoot, destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
}

function cacheDescriptor(workspace, paths, command, binding) {
  if (!command.cache) return null;
  const runtimeRelative = path.relative(workspace, paths.runtime);
  const runtimeInWorkspace = !runtimeRelative.startsWith("..") && !path.isAbsolute(runtimeRelative)
    ? paths.runtime : null;
  const inputs = digestWorkspacePatterns(workspace, command.cache.inputs, runtimeInWorkspace);
  const key = digest({
    category: command.cache.category,
    run: command.run,
    cwd: command.cwd,
    sourceHead: binding.heads.sourceHead,
    inputDigest: inputs.digest,
    toolDigest: binding.toolDigest,
    packageDigest: binding.packageProof.digest,
    authorizationDigest: binding.authorizationProof.digest,
    sourceProofDigest: binding.sourceProof.digest,
  });
  return {
    key,
    inputs,
    directory: path.join(paths.caches, command.cache.category, key),
  };
}

function restoreCache(workspace, command, descriptor) {
  if (!descriptor || !fs.existsSync(descriptor.directory)) return null;
  const manifestPath = path.join(descriptor.directory, "manifest.json");
  const filesRoot = path.join(descriptor.directory, "files");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(filesRoot))
    throw new Error(`cache entry is incomplete: ${descriptor.key}`);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch { throw new Error(`cache manifest is invalid: ${descriptor.key}`); }
  if (manifest.key !== descriptor.key || manifest.outputDigest !== outputManifest(filesRoot, command.cache.outputs).digest)
    throw new Error(`cache entry content does not match its address: ${descriptor.key}`);
  for (const output of command.cache.outputs) copyOutput(filesRoot, workspace, output);
  return manifest;
}

function saveCache(workspace, paths, command, descriptor) {
  if (!descriptor) return null;
  const parent = path.dirname(descriptor.directory);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(descriptor.directory))
    return JSON.parse(fs.readFileSync(path.join(descriptor.directory, "manifest.json"), "utf8"));
  const temp = path.join(parent, `.tmp-${descriptor.key}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
  const filesRoot = path.join(temp, "files");
  fs.mkdirSync(filesRoot, { recursive: true });
  try {
    for (const output of command.cache.outputs) copyOutput(workspace, filesRoot, output);
    const output = outputManifest(filesRoot, command.cache.outputs);
    atomicWriteJson(path.join(temp, "manifest.json"), {
      key: descriptor.key,
      category: command.cache.category,
      inputDigest: descriptor.inputs.digest,
      outputDigest: output.digest,
      outputs: output.entries,
    });
    try { renameSyncWithRetry(temp, descriptor.directory); }
    catch (error) {
      if (!fs.existsSync(descriptor.directory)) throw error;
      safeRemoveWithin(parent, temp);
    }
    return {
      key: descriptor.key,
      category: command.cache.category,
      inputDigest: descriptor.inputs.digest,
      outputDigest: output.digest,
      outputs: output.entries,
    };
  } catch (error) {
    if (fs.existsSync(temp)) safeRemoveWithin(parent, temp);
    throw error;
  }
}

function gitStatus(root) {
  return git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
}

function tailAppend(state, chunk) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  state.hash.update(buffer);
  state.bytes += buffer.length;
  if (state.bytes > MAX_OUTPUT_BYTES) state.overflow = true;
  state.tail = Buffer.concat([state.tail, buffer]).subarray(-65536);
}

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    try { child.kill("SIGKILL"); } catch {}
  }
}

function executeCommand(workspace, command, progress, ordinal, total, heartbeatMs, cacheStatus) {
  return new Promise((resolve) => {
    const started = Date.now();
    const stdout = { hash: crypto.createHash("sha256"), bytes: 0, tail: Buffer.alloc(0), overflow: false };
    const stderr = { hash: crypto.createHash("sha256"), bytes: 0, tail: Buffer.alloc(0), overflow: false };
    const cwd = command.cwd === "." ? workspace : inside(workspace, command.cwd, "command cwd").absolute;
    const child = spawn(command.run, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const event = (status) => progress({
      stage: command.stage,
      case: ordinal,
      total,
      currentProject: command.project,
      elapsedMs: Date.now() - started,
      pid: child.pid || null,
      cacheStatus,
      status,
    });
    event("running");
    child.stdout.on("data", (chunk) => {
      tailAppend(stdout, chunk);
      if (stdout.overflow) killTree(child);
    });
    child.stderr.on("data", (chunk) => {
      tailAppend(stderr, chunk);
      if (stderr.overflow) killTree(child);
    });
    const heartbeat = setInterval(() => event("heartbeat"), heartbeatMs);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, command.timeoutMs);
    child.on("error", (error) => tailAppend(stderr, String(error.stack || error)));
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      const passed = code === 0 && !timedOut && !stdout.overflow && !stderr.overflow;
      const result = {
        id: command.id,
        stage: command.stage,
        case: command.case,
        project: command.project,
        rule: command.rule,
        run: command.run,
        final: command.final,
        exitCode: code,
        signal: signal || null,
        timedOut,
        elapsedMs: Date.now() - started,
        pid: child.pid || null,
        cacheStatus,
        stdoutSha256: stdout.hash.digest("hex"),
        stderrSha256: stderr.hash.digest("hex"),
        stdoutBytes: stdout.bytes,
        stderrBytes: stderr.bytes,
        stdoutTail: passed ? "" : stdout.tail.toString("utf8"),
        stderrTail: passed ? "" : stderr.tail.toString("utf8"),
        outputOverflow: stdout.overflow || stderr.overflow,
      };
      event(passed ? "passed" : "failed");
      resolve(result);
    });
  });
}

async function runPool(items, workers, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, next));
  return results;
}

function progressEmitter(handler) {
  const started = Date.now();
  return (event) => handler({
    type: "strict-gate-progress",
    elapsedMs: Date.now() - started,
    ...event,
  });
}

async function runOne(root, paths, templateWorkspace, sourceHead, plan, command,
  progress, ordinal, total, heartbeatMs, isolated) {
  let workspace = templateWorkspace;
  let ephemeral = null;
  let workspaceMode = "template";
  if (command.cleanCheckout || isolated) {
    const key = `case-${plan.digest.slice(0, 12)}-${command.id}-${process.pid}`;
    workspace = ensureWorkspace(root, paths, sourceHead, key);
    ephemeral = key;
    workspaceMode = command.cleanCheckout ? "clean-checkout" : "parallel-isolated";
  }
  try {
    const descriptor = cacheDescriptor(workspace, paths, command, plan.binding);
    const beforeCache = gitStatus(workspace);
    const restored = restoreCache(workspace, command, descriptor);
    if (restored) {
      if (gitStatus(workspace) !== beforeCache)
        throw new Error(`cached output for '${command.id}' changes versionable repository state`);
      progress({
        stage: command.stage, case: ordinal, total,
        currentProject: command.project, elapsedMs: 0, pid: process.pid,
        cacheStatus: "hit", status: "passed",
      });
      return {
        id: command.id, stage: command.stage, case: command.case,
        project: command.project, run: command.run, final: command.final,
        rule: command.rule,
        exitCode: 0, signal: null, timedOut: false, elapsedMs: 0,
        pid: process.pid, cacheStatus: "hit", stdoutSha256: digest(""),
        stderrSha256: digest(""), stdoutBytes: 0, stderrBytes: 0,
        stdoutTail: "", stderrTail: "", outputOverflow: false,
        workspaceMode,
        cacheKey: descriptor.key,
        cacheInputDigest: descriptor.inputs.digest,
        cacheOutputDigest: restored.outputDigest,
      };
    }
    const before = gitStatus(workspace);
    const result = await executeCommand(
      workspace, command, progress, ordinal, total, heartbeatMs,
      descriptor ? "miss" : "bypass",
    );
    result.workspaceMode = workspaceMode;
    const after = gitStatus(workspace);
    if (before !== after) {
      result.exitCode = null;
      result.stderrTail += "\ncommand changed versionable repository state";
    }
    if (descriptor) {
      result.cacheKey = descriptor.key;
      result.cacheInputDigest = descriptor.inputs.digest;
    }
    if (result.exitCode === 0 && !result.timedOut && !result.outputOverflow) {
      const saved = saveCache(workspace, paths, command, descriptor);
      if (saved) result.cacheOutputDigest = saved.outputDigest;
    }
    return result;
  } finally {
    if (ephemeral) removeOwnedWorkspace(root, paths, workspace, ephemeral, sourceHead);
  }
}

function timingReport(results, stageWalls) {
  const commands = [...results]
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .map((result) => ({
      id: result.id,
      stage: result.stage,
      project: result.project,
      rule: result.rule,
      elapsedMs: result.elapsedMs,
      cacheStatus: result.cacheStatus,
    }));
  const rules = commands.filter((item) => item.rule).map((item) => ({
    rule: item.rule,
    id: item.id,
    elapsedMs: item.elapsedMs,
    cacheStatus: item.cacheStatus,
  }));
  return {
    slowestCommands: commands,
    slowestRules: rules,
    stages: stageWalls.sort((a, b) => b.elapsedMs - a.elapsedMs),
  };
}

async function verifyStrictGate(root, configPath, planPath, {
  outputPath = null,
  workers = null,
  heartbeatMs = null,
  onProgress = () => {},
} = {}) {
  const configLoaded = readJson(root, configPath, "strict-gate config");
  const config = normalizeConfig(configLoaded.value);
  let executionWorkers = config.workers;
  let executionHeartbeatMs = config.heartbeatMs;
  if (workers != null) {
    const value = Number(workers);
    if (!Number.isSafeInteger(value) || value < 1 || value > 32)
      throw new Error("--workers must be an integer from 1 to 32");
    executionWorkers = value;
  }
  if (heartbeatMs != null) {
    const value = Number(heartbeatMs);
    if (!Number.isSafeInteger(value) || value < 100 || value > 300000)
      throw new Error("--heartbeat-ms must be an integer from 100 to 300000");
    executionHeartbeatMs = value;
  }
  const plan = verifySignedObject(readJson(root, planPath, "strict-gate plan").value,
    PLAN_SCHEMA, "strict-gate plan");
  const configDigest = digest(fs.readFileSync(configLoaded.absolute));
  const binding = buildBinding(root, config, configDigest);
  binding.planDigest = plan.binding.planDigest;
  if (!sameBinding(plan.binding, binding) || digest(config) !== digest(plan.config))
    throw new Error("strict-gate plan is stale; run prepare again");
  if (digest(plan.executionGraph) !== digest(buildExecutionGraph(config)))
    throw new Error("strict-gate execution graph is stale; run prepare again");
  plan.config = config;
  plan.binding = binding;

  const paths = runtimePaths(root, config);
  const workspaceKey = `template-${plan.digest.slice(0, 20)}`;
  const workspace = ensureWorkspace(root, paths, binding.heads.sourceHead, workspaceKey);
  const progress = progressEmitter(onProgress);
  const results = [];
  const stageWalls = [];
  const commandById = new Map(config.commands.map((command) => [command.id, command]));
  const total = config.commands.length;
  try {
    for (const graphStage of plan.executionGraph.stages) {
      const stageStarted = Date.now();
      const graphNodes = graphStage.nodes.map((id) =>
        plan.executionGraph.nodes.find((node) => node.id === id));
      const unique = graphNodes.filter((node) => node.executes).map((node) => ({
        command: commandById.get(node.id), node,
      }));
      const aliases = graphNodes.filter((node) => !node.executes).map((node) => ({
        command: commandById.get(node.id), node,
      }));
      const stageResults = await runPool(unique, executionWorkers, ({ command, node }) =>
        runOne(root, paths, workspace, binding.heads.sourceHead, plan, command,
          progress, node.ordinal, total, executionHeartbeatMs,
          executionWorkers > 1 && unique.length > 1));
      const resultsById = new Map(stageResults.map((result) => [result.id, result]));
      for (const { command, node } of aliases) {
        const source = resultsById.get(node.deduplicatedFrom);
        const result = {
          ...source,
          id: command.id,
          case: command.case,
          project: command.project,
          rule: command.rule,
          cacheStatus: "deduplicated",
          deduplicatedFrom: node.deduplicatedFrom,
          elapsedMs: 0,
        };
        resultsById.set(command.id, result);
        progress({
          stage: graphStage.id, case: node.ordinal, total, currentProject: command.project,
          elapsedMs: 0, pid: process.pid, cacheStatus: "deduplicated", status: "passed",
        });
      }
      results.push(...graphStage.nodes.map((id) => resultsById.get(id)));
      stageWalls.push({ stage: graphStage.id, elapsedMs: Date.now() - stageStarted });
      if (stageResults.some((result) => result.exitCode !== 0 || result.timedOut || result.outputOverflow))
        break;
    }
  } finally {
    cleanOwnedWorkspace(root, paths, workspace, workspaceKey, binding.heads.sourceHead);
  }

  const timing = timingReport(results, stageWalls);
  const finalResults = results.filter((result) => result.final);
  const ok = results.length === config.commands.length && results.every((result) =>
    result.exitCode === 0 && !result.timedOut && !result.outputOverflow) &&
    finalResults.length > 0 && finalResults.every((result) => result.cacheStatus !== "hit");
  const currentBinding = buildBinding(root, config, configDigest);
  currentBinding.planDigest = plan.binding.planDigest;
  if (!sameBinding(binding, currentBinding))
    throw new Error("strict-gate inputs changed during verification; no bundle was created");
  if (!ok) return { ok: false, phase: "verify", results, timing, bundle: null };

  const resultDigest = digest(results.map((result) => ({
    id: result.id,
    rule: result.rule,
    run: result.run,
    exitCode: result.exitCode,
    stdoutSha256: result.stdoutSha256,
    stderrSha256: result.stderrSha256,
    cacheStatus: result.cacheStatus,
    cacheKey: result.cacheKey || null,
    cacheInputDigest: result.cacheInputDigest || null,
    cacheOutputDigest: result.cacheOutputDigest || null,
    final: result.final,
  })));
  const bundleCore = {
    schema: BUNDLE_SCHEMA,
    plan,
    binding,
    strictGate: {
      ok: true,
      resultDigest,
      execution: {
        workers: executionWorkers,
        heartbeatMs: executionHeartbeatMs,
        workspaceStrategy: executionWorkers > 1
          ? "isolated-parallel-worktrees"
          : "reusable-template-plus-clean-checkouts",
      },
      results,
    },
    timing,
  };
  const bundle = { ...bundleCore, digest: digest(bundleCore) };
  const output = outputPath
    ? inside(root, outputPath, "bundle output").absolute
    : path.join(paths.bundles, `${bundle.digest}.json`);
  atomicWriteJson(output, bundle);
  return { ok: true, phase: "verify", results, timing, bundle, path: output };
}

function checkedOutBranches(root) {
  const output = git(root, ["worktree", "list", "--porcelain"]).stdout;
  return output.split(/\r?\n/)
    .filter((line) => line.startsWith("branch "))
    .map((line) => line.slice(7));
}

function applyStrictGate(root, configPath, bundlePath, outputPath = null) {
  const started = Date.now();
  const configLoaded = readJson(root, configPath, "strict-gate config");
  const config = normalizeConfig(configLoaded.value);
  const bundle = verifySignedObject(readJson(root, bundlePath, "verification bundle").value,
    BUNDLE_SCHEMA, "verification bundle");
  verifySignedObject(bundle.plan, PLAN_SCHEMA, "bundled strict-gate plan");
  if (!bundle.strictGate || bundle.strictGate.ok !== true ||
      !Array.isArray(bundle.strictGate.results) ||
      bundle.strictGate.results.some((result) => result.exitCode !== 0) ||
      !bundle.strictGate.results.some((result) => result.final))
    throw new Error("verification bundle does not contain a successful final strict gate");
  const configDigest = digest(fs.readFileSync(configLoaded.absolute));
  const binding = buildBinding(root, config, configDigest);
  binding.planDigest = bundle.binding.planDigest;
  if (!sameBinding(bundle.binding, binding) || digest(config) !== digest(bundle.plan.config))
    throw new Error("verification bundle is stale; an input changed after verification");
  if (checkedOutBranches(root).includes(config.targetRef))
    throw new Error(`targetRef is checked out in a worktree and cannot be updated atomically: ${config.targetRef}`);

  const update = git(root, [
    "update-ref", "-m", `agentlintel verified bundle ${bundle.digest}`,
    config.targetRef, binding.heads.sourceHead, binding.heads.targetHead,
  ], { allowFailure: true });
  if (update.status !== 0)
    throw new Error(`atomic apply failed: ${String(update.stderr || update.stdout).trim()}`);
  const appliedHead = resolveCommit(root, config.targetRef, "targetRef after apply");
  if (appliedHead !== binding.heads.sourceHead)
    throw new Error("atomic apply did not produce the verified source head");
  const receiptCore = {
    schema: RECEIPT_SCHEMA,
    bundleDigest: bundle.digest,
    targetRef: config.targetRef,
    previousHead: binding.heads.targetHead,
    appliedHead,
    elapsedMs: Date.now() - started,
  };
  const receipt = { ...receiptCore, digest: digest(receiptCore) };
  const paths = runtimePaths(root, config);
  const output = outputPath
    ? inside(root, outputPath, "apply receipt output").absolute
    : path.join(paths.receipts, `${receipt.digest}.json`);
  atomicWriteJson(output, receipt);
  return { ok: true, phase: "apply", receipt, path: output };
}

module.exports = {
  PLAN_SCHEMA,
  BUNDLE_SCHEMA,
  CACHE_CATEGORIES,
  stable,
  digest,
  renameSyncWithRetry,
  normalizeConfig,
  prepareStrictGate,
  verifyStrictGate,
  applyStrictGate,
};
