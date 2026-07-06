# Production Feedback

Evidence base: the AgentLintel v2 repo plus two production multi-repo
workspaces migrated from v1/pre-rename governance. The migration covered 11
repos across .NET, React, infrastructure, local-dev, docs, and legacy-host
surfaces.

## Result

The ideas held up; the old delivery shape did not. Repo-local verified facts,
rules, guard zones, exemplars, ADRs, hooks, PR reports, and strict CI gates were
the useful core. v1's workspace-root prose and unverified metadata stranded
adopters and created drift.

The v2 repair moved governance into each repo's git tree, kept workspace mode
as scope configuration only, and made every claimed rule either fixture-backed
or deleted. All migrated repos passed `agentlintel verify --strict`; product
build/test gates were run where applicable.

## Caveats

- The evidence is still early: two related deployments, same architect, no
  public control-arm benchmark yet.
- Some product gates also had native architecture tests, dependency-cruiser, or
  guard scripts, so consistency claims are correlational until the benchmark in
  [BENCHMARK-PROTOCOL.md](BENCHMARK-PROTOCOL.md) is run.
- One product-side failure observed during migration was preexisting and not
  caused by AgentLintel; the migration recorded it rather than hiding it.

## Lessons Kept

- Exemplar mirroring is the distinctive behavior: agents copy working structure
  more reliably than they obey prose.
- Facts must be checked against files or commands; otherwise they become stale
  instructions.
- Guard zones and external engines are the bridge from agent guidance to
  enforceable architecture.
- Migration honesty matters: unverifiable v1 claims become `pending`, never
  fake-green.

## Follow-Up

1. Keep the install path tarball-first until npm publishing is configured.
2. Run the public benchmark before making causal adoption claims.
3. Keep docs short and current; move rationale to ADRs or delete it.
4. Prefer project-native external engines for deep checks and report findings
   under stable AgentLintel rule ids.
