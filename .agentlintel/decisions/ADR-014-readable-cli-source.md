# ADR-014: Readable CLI Source in the Shipped Package

Accepted: 2026-07-04

AgentLintel's trust story depends on reviewers being able to inspect the gate
that will fail their pull requests. Shipping runtime JavaScript as minified
one-line source contradicts that story even when the package includes `src/`.
The files existed, so "missing source" was a false read; "opaque source" was a
valid criticism.

Decision:

- The executable bin becomes a tiny launcher; CLI dispatch lives in
  `src/cli.js`.
- Runtime JavaScript in the npm package must stay audit-readable at the
  identifier level, not just the formatting level. Prettier-formatted minifier
  output (`function verify(e, t)`) is still opaque; every runtime module is
  hand-readable source with meaningful names. The package suite fails if
  shipped runtime files collapse back into minified blobs or into
  mostly-single-letter declarations.
- Public wording keeps the deterministic-gate claim for exit-code behavior, but
  states the detection boundary: built-in engines are portable syntactic
  starter checks, and deep semantic architecture checks should use
  `engine: external` with project-native analyzers.
- The framework repo describes its dogfooding precisely: it exercises the
  governance mechanics and conformance fixtures, not a production vertical-slice
  application.

Budget consequence: readable runtime source increases the normalized npm
unpacked payload from ~102.6 KB to ~139.5 KB and the eligible tracked payload
to ~205.0 KB. The package byte budget recalibrates to 141,000 and the eligible
tracked byte budget recalibrates to 207,000. The always-load budget is
unchanged; the extra bytes are shipped implementation source, not agent
context.

Out of scope: a full semantic rewrite of the built-in regex engines. They
remain deterministic starter checks. The deeper path is explicit external
engines, not pretending regex sees types.
