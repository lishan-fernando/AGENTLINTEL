# Audit: Verifier Throughput and Token Efficiency

- Repo: AGENTLINTEL (framework repo)
- Scope: CLI verify/report pipeline, test suite, agent-facing token surfaces
- Date: 2026-07-28
- Coverage: full

## Baseline commands (before -> after)

| Command | Before | After |
|---|---:|---:|
| `node bin/agentlintel.js verify --dir ../..` | 4.16s, GATE PASSED | ~1.3s, GATE PASSED |
| `verify --diff --quiet --bail --no-run --skip-fixtures` | 2.03s | ~1.0s |
| `npm test` (187 tests) | 73.4s, 185 pass / 2 skipped | 28.7s, same counts |
| `verify.js` orchestration lines | 3,196 / 3,200 ceiling | ~2,890 |
| Always-load tokens (AGENTS.md + skill frontmatters) | ~1,142 / ~2,048 | ~1,170 / ~2,048 |
| `verify --json` clean-run output | ~9,010 chars (~2.3K tok) | one line (~800 tok) |

Environment: Windows 11, Node spawn ~90ms/git, ~40ms/node measured.

## Findings

| id | path | evidence | severity | action |
|---|---|---|---|---|
| F1 | tools/agentlintel-cli/src/lib/verify.js | untracked-governance scan walked the whole tree every run | medium | fixed: governance roots only (`untrackedGovernanceArtifacts`) |
| F2 | src/lib/verify.js (now safe-paths.js) | root realpath re-resolved per file; duplicate lstat per safe-path check | medium | fixed: memoized root realpaths, single lstat |
| F3 | src/lib/verify.js (now git-state.js) | inventory used 5 git spawns; tracked set re-queried; baseline blobs re-read | medium | fixed: 3 spawns, tracked derived from `-v` listing, per-run blob memo |
| F4 | tools/agentlintel-cli/test/governance.test.js | 63s serial file = suite critical path (70+ verify calls) | high | fixed: split into no-new / ratchets / kernel + shared helpers |
| F5 | tools/agentlintel-cli/src/cli.js | `--json` pretty-printed the result graph for machine consumers | low | fixed: compact single-line JSON |
| F6 | tools/agentlintel-cli/templates/AGENTS.template.md | adopter template never mentioned the lean loop or explain-first | medium | fixed: both lines added + pinned by facts |
| F7 | .agentlintel/facts.yaml | lean agent-loop recipe was advice, not a checked fact | low | fixed: `agent-loop-lean-recipe`, `adopter-template-lean-recipe` facts |
| F8 | src/lib/verify.js | 3,196/3,200 line ceiling left 4 lines of headroom | medium | fixed: safe-paths.js and git-state.js extractions |

## Clean sweeps (checked, none found)

- Async rewrite opportunities worth taking: none; the process is short-lived
  and call-count reduction delivered the wins.
- Violation snapshot / baseline artifact proposals: none; ADR-028's Git-derived
  ratchet already derives state per run.
- Seventh framework concepts introduced by this program: none (facts + ADR only).
- `gitStateFingerprint` spawn count: 6 probes x 2 is intentional tamper
  evidence around dynamic checks; not redundant, not touched.
- Template mirror (~19KB) is install-time cost; agents never load both trees.

## Exemption ledger

No AGENTLINTEL-EXEMPT markers added, modified, or expired by this program.

## Top three risks

1. `external-engines.test.js` (~20s) is the new suite critical path; further
   test-time gains must come from there, not governance.
2. Adopters on alpha.13 or older still get pretty `--json`; the lean recipe
   only reaches them on upgrade.
3. Byte budgets were rebaselined per milestone under ADR-029; the final caps
   must keep under-one-percent headroom discipline or the ratchet culture
   weakens by example.

## Follow-up verification commands

```
cd tools/agentlintel-cli && npm ci --no-audit --no-fund
node bin/agentlintel.js verify --dir ../..
npm test
```
