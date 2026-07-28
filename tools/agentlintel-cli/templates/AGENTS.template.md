# AGENTS.md

<!-- AGENTLINTEL v2. Only always-load file. Code-state claims live in facts.yaml. -->

## Project

<one paragraph: what this codebase is, stack, how it's organized>

## Verify (the gate)

```
npx @agentlintel/cli verify
```

Run before declaring work done. CI runs `--strict`; a failing gate fails the PR.

## Architecture Contract

Rules live in `.agentlintel/rules.yaml`; YAML wins over prose. The selected
pattern may be vertical-slice, layered-3tier, MVVM, or custom; follow the YAML
installed here.

If you must break a rule, use an exemption with every field:

```
// AGENTLINTEL-EXEMPT: <rule-id>
// Reason: <why>
// Approver: <who signed off>
// Expires: <YYYY-MM-DD>
// Owner: <team or person>
// Decision: ADR-<number>
```

Expired, incomplete, or ADR-unauthorized exemptions fail.

## Work like this

- **Mirror exemplars.** Read `.agentlintel/exemplars.yaml` and copy the matching
  shape. If none matches, ask a human to nominate one.
- **Trust facts.yaml.** Its paths, commands, and stack claims are verified.
- **Obey rules.yaml exactly.** A failing `agentlintel verify` means incomplete.
- **Stay inside write zones.** `.agentlintel/guard.json` declares allowed paths.
- **Record intent as ADRs.** Append decisions in `.agentlintel/decisions/`.

## Principles (advice, not machine-enforced)

- Don't abstract until duplication appears three times with identical meaning.
- Implement only current acceptance criteria; reuse existing code and prefer
  standard-library or native platform features before adding a dependency.
- Simplify along business or contract boundaries, not arbitrary technical layers.
- Shared code is generic; product-specific code belongs in the pattern's
  business/module boundary.
- Cross-boundary access goes through public contracts.

## Skills

Task workflows live in `.agents/skills/` and load on demand.
