// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { migrate } = require("./migrate");

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

function copyDirInto(sourceDir, targetDir, { force = false, log, prefix }) {
  if (!fs.existsSync(sourceDir)) {
    log.push(`ERROR template dir missing: ${sourceDir}`);
    return false;
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyDirInto(sourcePath, targetPath, {
        force,
        log,
        prefix: `${prefix}/${entry.name}`,
      });
    } else if (!fs.existsSync(targetPath) || force) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  return true;
}

function copyFile(mapping, root, { force, log }) {
  const sourcePath = path.join(TEMPLATES, mapping.from);
  const targetPath = path.join(root, mapping.to);

  if (!fs.existsSync(sourcePath)) {
    log.push(`ERROR template missing: ${mapping.from}`);
    return false;
  }
  if (fs.existsSync(targetPath) && !force) {
    log.push(`skip  ${mapping.to} (exists; use --force to overwrite)`);
    return true;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  log.push(`write ${mapping.to}`);
  return true;
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

  fs.mkdirSync(path.join(root, ".agentlintel", "decisions"), { recursive: true });

  const migratedTargets = new Set();
  if (fromV1) {
    const migration = migrate(root);
    log.push(...migration.log);
    if (!migration.ok) return { ok: false, log };

    for (const [target, content] of Object.entries(migration.files)) {
      const targetPath = path.join(root, target);
      if (!fs.existsSync(targetPath) || force || target.endsWith("MIGRATION.md")) {
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
      ok = copyFile(mapping, root, { force, log }) && ok;

  let wrotePattern = false;
  let patternRefused = false;
  if (!migratedTargets.has(".agentlintel/rules.yaml")) {
    const rulesPath = path.join(root, ".agentlintel", "rules.yaml");
    if (fs.existsSync(rulesPath) && !force) {
      patternRefused = true;
      log.push(
        `note  pattern '${pattern}' NOT applied - .agentlintel/rules.yaml exists (use --force to replace it)`,
      );
    } else {
      ok =
        copyFile(
          {
            from:
              pattern === DEFAULT_PATTERN
                ? "rules.template.yaml"
                : `patterns/${pattern}/rules.yaml`,
            to: ".agentlintel/rules.yaml",
          },
          root,
          { force, log },
        ) && ok;
      wrotePattern = true;
      log.push(
        `note  architecture pattern: ${pattern} (see .agentlintel/rules.yaml; other packs: ${availablePatterns().join(", ")})`,
      );
    }
  }

  // Fixtures follow the rule set: never copy a pattern's fixtures beside a
  // rules.yaml the pattern was refused permission to replace.
  const conformanceDir = path.join(root, ".agentlintel", "conformance");
  if (!patternRefused && (wrotePattern || !fs.existsSync(conformanceDir))) {
    if (pattern === DEFAULT_PATTERN) {
      ok =
        copyDirInto(path.join(TEMPLATES, "conformance"), conformanceDir, {
          force,
          log,
          prefix: "conformance",
        }) && ok;
    } else {
      const packConformance = path.join(TEMPLATES, "patterns", pattern, "conformance");
      const packFixtures = fs.existsSync(packConformance)
        ? fs.readdirSync(packConformance)
        : [];
      if (packFixtures.length)
        ok =
          copyDirInto(packConformance, conformanceDir, {
            force,
            log,
            prefix: "conformance",
          }) && ok;
      for (const fixture of UNIVERSAL_FIXTURES)
        if (!packFixtures.includes(fixture))
          ok =
            copyDirInto(
              path.join(TEMPLATES, "conformance", fixture),
              path.join(conformanceDir, fixture),
              { force, log, prefix: `conformance/${fixture}` },
            ) && ok;
    }
    log.push("write .agentlintel/conformance/ (fixtures for the starter rules)");
  }

  ok =
    copyDirInto(
      path.join(TEMPLATES, "skills"),
      path.join(root, ".agentlintel", "skills"),
      { force, log, prefix: "skills" },
    ) && ok;
  log.push(
    "write .agentlintel/skills/ (strangler-extraction, mirror-exemplar, audit-architecture)",
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
        { force, log, prefix: "adapters/conformance-snippets" },
      ) && ok;
    log.push(
      "note  engine adapters are starter glue; copy snippets plus matching fixture dirs when enabling rules.",
    );
  }

  if (hooks) {
    for (const hook of ["verify-hook.sh", "pretooluse-hook.sh"]) {
      ok =
        copyFile(
          { from: `hooks/${hook}`, to: `.agentlintel/hooks/${hook}` },
          root,
          { force, log },
        ) && ok;
      try {
        fs.chmodSync(path.join(root, ".agentlintel", "hooks", hook), 0o755);
      } catch {}
    }
    log.push(
      "note  register hooks in Claude Code .claude/settings.json (Stop and/or PreToolUse).",
    );
    log.push(
      "      Invoke via the interpreter - exec bits do not survive Windows checkouts:",
    );
    log.push(
      '        {"hooks":{"Stop":[{"hooks":[{"type":"command","command":"sh .agentlintel/hooks/verify-hook.sh"}]}]}}',
    );
    log.push(
      '        {"hooks":{"PreToolUse":[{"matcher":"Edit|Write|MultiEdit","hooks":[{"type":"command","command":"sh .agentlintel/hooks/pretooluse-hook.sh"}]}]}}',
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
    "  6. Wire CI: `agentlintel verify --strict` on every PR. A rule that does not run in CI does not exist.",
  );

  return { ok, log };
}

module.exports = { init };
