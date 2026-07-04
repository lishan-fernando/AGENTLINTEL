# Adoption Playbook - July 2026

Goal: first verified PR in about 30 minutes, then tighten rules as the repo
proves its shape.

## Start

```bash
npm i -D https://github.com/lishan-fernando/AGENTLINTEL/releases/download/v2.0.0-alpha.7/agentlintel-cli.tgz
npx agentlintel init
npx agentlintel verify
```

Choose a pattern only when the default vertical-slice rules do not fit:

```bash
npx agentlintel init --pattern layered-3tier
npx agentlintel init --pattern mvvm
npx agentlintel init --pattern custom
```

Use `--from-v1` only for an existing v1 or `.ai-governance` layout. The
migrator keeps derivable checks, marks the rest `pending`, and writes
`.agentlintel/MIGRATION.md`.

## First PR Checklist

- Fill `facts.yaml` with paths/commands the machine can check.
- Register one real exemplar in `exemplars.yaml`.
- Delete starter rules that do not apply.
- Keep `must_match: false` only for deliberate future-carrier rules; flip to
  `true` once matching paths exist.
- Wire CI with `agentlintel verify --strict`.
- Add `init --hooks` only after local verify is green.

## Brownfield Rollout

1. Run the gate in advisory mode: `verify --no-run --skip-fixtures`.
2. Fix stale facts and missing exemplars.
3. Turn on fixtures and project-native external engines.
4. Turn warnings into blockers with `--strict`.
5. Use bounded exemptions only for reviewed debt:
   `Reason`, `Approver`, `Expires`, `Owner`.

## Native Engines

Use `init --engine-adapters` when regex is too weak. Typical mappings:

- Frontend public surfaces: dependency-cruiser -> `engine: external`.
- .NET architecture tests: `dotnet test` -> `adapter: dotnet-test`.
- Custom tools: JSONL findings `{file,line,message}` on stdout.

Each external rule still needs fixtures. Fixtures validate output mapping; live
engines run during tree verify unless `--no-run` or `--diff` is used.

## Multi-Repo

Put governance inside each repo. Use `agentlintel.workspace.yaml` only to list
members for fan-out:

```yaml
members:
  - app-api
  - app-web
```

Run `agentlintel verify --workspace` from the workspace root.

## Claim Boundary

Say: "AgentLintel gives AI-agent repos a deterministic architecture gate."
Do not claim proven causal impact until the benchmark protocol has produced
public results.
