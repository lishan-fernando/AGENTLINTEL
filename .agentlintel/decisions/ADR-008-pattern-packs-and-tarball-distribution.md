# ADR-008: Pattern packs via a layers engine; tarball distribution

Date: 2026-07-02
Status: Accepted

## Context

Two adoption blockers surfaced from private v1 deployments:

1. **Distribution.** Private adopters copy-pasted (vendored) the framework
   because no installable package existed. Vendored kits get no updates — one
   deployment pinned to an extinct kit layout while another carried a rule bug
   fixed elsewhere. Private migration notes named this the stranding problem.
2. **Genericity.** The reference rules encode one company's architecture
   (vertical slices, Result, slice-local error codes). A generic framework must
   support common patterns (3-tier, MVVM, hexagonal, ...) and let a team define
   a custom pattern with minimal effort — without hand-writing regexes per
   pattern, which is exactly the calibration tax both deployments paid.

## Decisions

1. **`engine: layers`** — a declarative engine for architecture boundaries:
   layers as named path-glob groups plus an `allowed` dependency map
   (same-layer always allowed; omitted layer depends on nothing). It resolves
   TS/JS relative imports, alias prefixes, bare root-relative specifiers, and
   Python module paths against the layer globs; files outside every layer and
   bare package imports are ignored. This is the ArchUnit/Sheriff model
   delivered in the existing rule format: any layered pattern is ~10 lines of
   YAML plus fixtures. Deeper resolution (tsconfig paths, C# namespaces)
   remains the job of `engine: external` adapters — build on, never build.
2. **Pattern packs are rule presets, not a seventh concept.** A pack is a
   rules.yaml + conformance fixtures under the CLI's templates. `init
   --pattern vertical-slice|layered-3tier|mvvm|custom` selects one;
   vertical-slice stays the default (backward compatible). Every pack ships
   the universal rules (secrets.no-logging, exemption.audited) and its
   architecture rule with green fixtures — init stays green out of the box,
   and the "every rule has fixtures" law holds for packs. `custom` scaffolds a
   commented layers-rule skeleton (commented = no rule = no fixture debt until
   the team fills it in).
3. **Tarball releases replace vendoring.** A `Release` workflow on every `v*`
   tag runs the full gate, `npm pack`s the CLI, and attaches
   `agentlintel-cli.tgz` to a GitHub Release under a stable name. Adopters
   install with `npm i -D <release URL>` — versioned, upgradeable by bumping a
   URL, no npm account required on either side. The same workflow publishes to
   the npm registry automatically once an `NPM_TOKEN` secret exists, so
   registry publishing is a config change, not a code change.

## Consequences

- Private deployments de-vendor by deleting the framework clone and adding one
  devDependency line per repo; upgrades become visible diffs.
- "Supports my architecture" changes from "rewrite the rules" to "pick a pack
  or write 10 lines" — the genericity blocker.
- The engine count grows to five (regex, error-codes, exemptions, external,
  layers); the concept count stays six and the CLI stays three commands.
- Known limits, accepted: the layers engine is line-based and does not read
  tsconfig path mappings (declare `aliases` in the rule, or use an external
  engine); C#/Java namespace-based layering needs external arch tests.
