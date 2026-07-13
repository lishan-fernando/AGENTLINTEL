// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { migrate } = require("./migrate");
const { sameDirectory } = require("../lib/io");

const TEMPLATES = path.join(__dirname, "..", "..", "templates");
const FILES = [
  { from: "AGENTS.template.md", to: "AGENTS.md" },
  { from: "CLAUDE.template.md", to: "CLAUDE.md" },
  { from: "facts.template.yaml", to: ".agentlintel/facts.yaml" },
  { from: "guard.template.json", to: ".agentlintel/guard.json" },
  { from: "exemplars.template.yaml", to: ".agentlintel/exemplars.yaml" },
];
const DEFAULT_PATTERN = "vertical-slice";
const UNIVERSAL_FIXTURES = ["secrets.no-logging", "exemption.audited"];

function gitText(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && !result.stdout.includes("\uFFFD")
    ? result.stdout : null;
}

function enclosingGitMetadata(root) {
  let cursor = path.resolve(root);
  while (true) {
    try {
      fs.lstatSync(path.join(cursor, ".git"));
      return cursor;
    } catch {}
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function initIndexBoundaryProblem(root, adapters) {
  const inside = gitText(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside == null)
    return enclosingGitMetadata(root)
      ? "Git metadata is present but the worktree could not be inspected"
      : null;
  if (inside.trim() !== "true") return null;
  const topLevel = gitText(root, ["rev-parse", "--show-toplevel"]);
  if (topLevel == null || !topLevel.trim()) return "Git top-level could not be read";
  if (!sameDirectory(root, topLevel.trim()))
    return `init root must be the Git top-level: ${topLevel.trim()}`;
  const output = gitText(root, ["ls-files", "--stage", "-z"]);
  if (output == null) return "Git index could not be read";

  const targets = [".agentlintel", ".agents/skills", "AGENTS.md", "CLAUDE.md"];
  if (adapters) targets.push(...ADAPTER_FILES.map((mapping) => mapping.to));
  for (const entry of output.split("\0").filter(Boolean)) {
    const match = entry.match(/^(120000|160000) [^\t]+\t([\s\S]+)$/);
    if (!match) continue;
    const boundary = match[2];
    if (targets.some((target) =>
      boundary === target || boundary.startsWith(`${target}/`) ||
      target.startsWith(`${boundary}/`)))
      return `Git mode ${match[1]} boundary intersects init output: ${boundary}`;
  }
  return null;
}

function generatedFixtureNames() {
  const names = new Set();
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
      if (entry.isDirectory()) names.add(entry.name);
  };
  collect(path.join(TEMPLATES, "conformance"));
  for (const pattern of availablePatterns().filter((name) => name !== DEFAULT_PATTERN))
    collect(path.join(TEMPLATES, "patterns", pattern, "conformance"));
  return names;
}

function writeTargetSafe(root, targetPath, log, requireDirectory = false) {
  const relative = path.relative(path.resolve(root), path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    log.push(`ERROR target escapes repository: ${targetPath}`);
    return false;
  }
  let cursor = path.resolve(root);
  const segments = relative.split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) {
        log.push(`ERROR refusing symlinked init target: ${path.relative(root, cursor)}`);
        return false;
      }
      const final = index === segments.length - 1;
      if ((!final || requireDirectory) && !stat.isDirectory()) {
        log.push(`ERROR init target ancestor is not a directory: ${path.relative(root, cursor)}`);
        return false;
      }
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      log.push(`ERROR init target could not be inspected: ${path.relative(root, cursor)}`);
      return false;
    }
  }
  return true;
}

function availablePatterns() {
  const patternsDir = path.join(TEMPLATES, "patterns");
  const packs = fs.existsSync(patternsDir)
    ? fs
        .readdirSync(patternsDir)
        .filter((name) => fs.statSync(path.join(patternsDir, name)).isDirectory())
    : [];
  return [DEFAULT_PATTERN, ...packs].sort();
}

const ADAPTER_FILES = [
  { from: "adapters/cursor.mdc", to: ".cursor/rules/agentlintel.mdc" },
  { from: "adapters/windsurf.md", to: ".windsurf/rules/agentlintel.md" },
  {
    from: "adapters/copilot.instructions.md",
    to: ".github/instructions/agentlintel.instructions.md",
  },
];
const ENGINE_ADAPTER_FILES = [
  {
    from: "engine-adapters/dependency-cruiser.frontend.cjs",
    to: ".agentlintel/adapters/dependency-cruiser.frontend.cjs",
  },
  {
    from: "engine-adapters/commit-message-policy.js",
    to: ".agentlintel/adapters/commit-message-policy.js",
  },
  {
    from: "engine-adapters/github-pr-policy.js",
    to: ".agentlintel/adapters/github-pr-policy.js",
  },
  {
    from: "engine-adapters/external-rules.snippets.yaml",
    to: ".agentlintel/adapters/external-rules.snippets.yaml",
  },
  {
    from: "engine-adapters/README.md",
    to: ".agentlintel/adapters/README.md",
  },
];

function copyDirInto(sourceDir, targetDir, { force = false, log, prefix, root }) {
  if (!fs.existsSync(sourceDir)) {
    log.push(`ERROR template dir missing: ${sourceDir}`);
    return false;
  }

  if (!writeTargetSafe(root, targetDir, log, true)) return false;

  let ok = true;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      if (!writeTargetSafe(root, targetPath, log, true)) {
        ok = false;
        continue;
      }
      fs.mkdirSync(targetPath, { recursive: true });
      ok = copyDirInto(sourcePath, targetPath, {
        force,
        log,
        prefix: `${prefix}/${entry.name}`,
        root,
      }) && ok;
    } else {
      if (!writeTargetSafe(root, targetPath, log)) {
        ok = false;
        continue;
      }
      if (!fs.existsSync(targetPath) || force) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  return ok;
}

function copyFile(mapping, root, { force, log }) {
  const sourcePath = path.join(TEMPLATES, mapping.from);
  const targetPath = path.join(root, mapping.to);

  if (!fs.existsSync(sourcePath)) {
    log.push(`ERROR template missing: ${mapping.from}`);
    return false;
  }
  if (!writeTargetSafe(root, targetPath, log)) return false;
  if (fs.existsSync(targetPath) && !force) {
    log.push(`skip  ${mapping.to} (exists; use --force to overwrite)`);
    return true;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  log.push(`write ${mapping.to}`);
  return true;
}

function resetConformanceFixtures(root, pattern, log) {
  const targetDir = path.join(root, ".agentlintel", "conformance");
  if (!fs.existsSync(targetDir)) return true;
  if (!writeTargetSafe(root, targetDir, log, true)) return false;
  const generated = generatedFixtureNames();
  let ok = true;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.name === "fixtures.schema.json") continue;
    if (!generated.has(entry.name)) {
      log.push(`preserve .agentlintel/conformance/${entry.name} (not a generated fixture)`);
      continue;
    }
    const targetPath = path.join(targetDir, entry.name);
    if (!entry.isDirectory() || !writeTargetSafe(root, targetPath, log, true)) {
      log.push(`ERROR refusing to remove non-directory conformance artifact: ${entry.name}`);
      ok = false;
      continue;
    }
    try {
      fs.rmSync(targetPath, { recursive: true });
      log.push(`delete .agentlintel/conformance/${entry.name}/ (reset for '${pattern}')`);
    } catch (error) {
      log.push(`ERROR could not remove obsolete fixture '${entry.name}': ${error.message || error}`);
      ok = false;
    }
  }
  return ok;
}

function init(
  root,
  {
    force = false,
    fromV1 = false,
    adapters = false,
    hooks = false,
    engineAdapters = false,
    pattern = DEFAULT_PATTERN,
    patternExplicit = pattern !== DEFAULT_PATTERN,
  } = {},
) {
  const log = [];
  let ok = true;

  if (!availablePatterns().includes(pattern))
    return {
      ok: false,
      log: [
        `ERROR unknown pattern '${pattern}'. Available: ${availablePatterns().join(", ")}`,
      ],
    };

  const indexProblem = initIndexBoundaryProblem(root, adapters);
  if (indexProblem)
    return { ok: false, log: [`ERROR ${indexProblem}`] };

  // Optional flags force only their own generated files. An explicit pattern
  // force resets rules + shipped fixtures; only bare force/migration resets
  // the full scaffold.
  const optionalOnly = adapters || hooks || engineAdapters;
  const coreForce = force && (fromV1 || (!optionalOnly && !patternExplicit));
  const patternForce = force && (coreForce || patternExplicit);

  const decisionsDir = path.join(root, ".agentlintel", "decisions");
  if (!writeTargetSafe(root, decisionsDir, log, true)) return { ok: false, log };
  fs.mkdirSync(decisionsDir, { recursive: true });

  const migratedTargets = new Set();
  if (fromV1) {
    const migration = migrate(root);
    log.push(...migration.log);
    if (!migration.ok) return { ok: false, log };

    for (const [target, content] of Object.entries(migration.files)) {
      const targetPath = path.join(root, target);
      if (!writeTargetSafe(root, targetPath, log)) {
        ok = false;
        continue;
      }
      if (!fs.existsSync(targetPath) || coreForce || target.endsWith("MIGRATION.md")) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content);
        log.push(`write ${target} (migrated from v1)`);
      } else {
        log.push(
          `skip  ${target} (exists; use --force to overwrite with the migrated draft)`,
        );
      }
      migratedTargets.add(target);
    }
  }

  for (const mapping of FILES)
    if (!migratedTargets.has(mapping.to))
      ok = copyFile(mapping, root, { force: coreForce, log }) && ok;

  let wrotePattern = false;
  let patternRefused = false;
  if (!migratedTargets.has(".agentlintel/rules.yaml")) {
    const rulesPath = path.join(root, ".agentlintel", "rules.yaml");
    if (!writeTargetSafe(root, rulesPath, log)) {
      ok = false;
      patternRefused = true;
    } else if (fs.existsSync(rulesPath) && !patternForce) {
      patternRefused = true;
      log.push(
        optionalOnly && force
          ? "note  preserved existing .agentlintel/rules.yaml while regenerating optional files"
          : `note  pattern '${pattern}' NOT applied - .agentlintel/rules.yaml exists (use --force to replace it)`,
      );
    } else {
      const fixturesReady = !patternForce || resetConformanceFixtures(root, pattern, log);
      if (!fixturesReady) {
        ok = false;
        patternRefused = true;
      } else {
        const copied = copyFile(
          {
            from:
              pattern === DEFAULT_PATTERN
                ? "rules.template.yaml"
                : `patterns/${pattern}/rules.yaml`,
            to: ".agentlintel/rules.yaml",
          },
          root,
          { force: patternForce, log },
        );
        ok = copied && ok;
        wrotePattern = copied;
        if (copied)
          log.push(
            `note  architecture pattern: ${pattern} (see .agentlintel/rules.yaml; other packs: ${availablePatterns().join(", ")})`,
          );
      }
    }
  }

  // Fixtures follow the rule set: never copy a pattern's fixtures beside a
  // rules.yaml the pattern was refused permission to replace.
  const conformanceDir = path.join(root, ".agentlintel", "conformance");
  if (!patternRefused && (wrotePattern || !fs.existsSync(conformanceDir))) {
    if (pattern === DEFAULT_PATTERN) {
      ok =
        copyDirInto(path.join(TEMPLATES, "conformance"), conformanceDir, {
          force: patternForce,
          log,
          prefix: "conformance",
          root,
        }) && ok;
    } else {
      const packConformance = path.join(TEMPLATES, "patterns", pattern, "conformance");
      const packFixtures = fs.existsSync(packConformance)
        ? fs.readdirSync(packConformance)
        : [];
      if (packFixtures.length)
        ok =
          copyDirInto(packConformance, conformanceDir, {
            force: patternForce,
            log,
            prefix: "conformance",
            root,
          }) && ok;
      ok = copyFile({
        from: "conformance/fixtures.schema.json",
        to: ".agentlintel/conformance/fixtures.schema.json",
      }, root, { force: patternForce, log }) && ok;
      for (const fixture of UNIVERSAL_FIXTURES)
        if (!packFixtures.includes(fixture))
          ok =
            copyDirInto(
              path.join(TEMPLATES, "conformance", fixture),
              path.join(conformanceDir, fixture),
              { force: patternForce, log, prefix: `conformance/${fixture}`, root },
            ) && ok;
    }
    log.push("write .agentlintel/conformance/ (fixtures for the starter rules)");
  }

  ok =
    copyDirInto(
      path.join(TEMPLATES, "skills"),
      path.join(root, ".agents", "skills"),
      { force: coreForce, log, prefix: "skills", root },
    ) && ok;
  log.push(
    "write .agents/skills/ (strangler-extraction, mirror-exemplar, audit-architecture)",
  );

  if (adapters) {
    for (const mapping of ADAPTER_FILES)
      ok = copyFile(mapping, root, { force, log }) && ok;
    log.push(
      "note  adapters are content-free pointers; verify fails them if they drift from the template",
    );
  }

  if (engineAdapters) {
    for (const mapping of ENGINE_ADAPTER_FILES)
      ok = copyFile(mapping, root, { force, log }) && ok;
    ok =
      copyDirInto(
        path.join(TEMPLATES, "engine-adapters", "conformance-snippets"),
        path.join(root, ".agentlintel", "adapters", "conformance-snippets"),
        { force, log, prefix: "adapters/conformance-snippets", root },
      ) && ok;
    log.push(
      "note  engine adapters are starter glue; copy snippets plus matching fixture dirs when enabling rules.",
    );
  }

  if (hooks) {
    const hook = "verify-hook.sh";
    const hookCopied = copyFile(
      { from: `hooks/${hook}`, to: `.agentlintel/hooks/${hook}` },
      root,
      { force, log },
    );
    ok = hookCopied && ok;
    if (hookCopied)
      try {
        fs.chmodSync(path.join(root, ".agentlintel", "hooks", hook), 0o755);
      } catch {}
    log.push(
      "note  register the end-of-turn gate in Claude Code .claude/settings.json.",
    );
    log.push(
      "      Invoke via the interpreter - exec bits do not survive Windows checkouts:",
    );
    log.push(
      '        {"hooks":{"Stop":[{"hooks":[{"type":"command","command":"sh .agentlintel/hooks/verify-hook.sh"}]}]}}',
    );
  }

  if (!fs.existsSync(path.join(root, ".git"))) {
    log.push("");
    log.push(
      "WARNING: this directory is not a git repository. Governance must live in git -",
    );
    log.push(
      "         unversioned governance has no audit trail and per-repo CI cannot see it.",
    );
  }

  log.push("");
  log.push("Next steps:");
  log.push("  1. Run `agentlintel verify` - it should pass out of the box.");
  log.push(
    "  2. Fill in .agentlintel/facts.yaml - every fact needs a passing machine check.",
  );
  log.push("  3. Register one canonical exemplar in .agentlintel/exemplars.yaml.");
  log.push(
    "  4. Edit AGENTS.md - keep it under 150 lines; it is the only always-load.",
  );
  log.push(
    "  5. Trim .agentlintel/rules.yaml; set must_match: true on rules once their paths exist.",
  );
  log.push(
    "  6. Wire CI with full history: `agentlintel verify --strict --base <target-sha>` on every PR. A rule that does not run in CI does not exist.",
  );

  return { ok, log };
}

module.exports = { init };
