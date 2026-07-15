# ADR-026: Bind Authority and Minimize Agent Context

Accepted: 2026-07-14

The stress test showed that AgentLintel could package useful deterministic
checks, but its claimed trust boundary was porous. A candidate could write a
syntactically complete exemption, any unrelated new ADR authorized every
contract weakening, registered exemplar contents were mutable, and a positive
rule could become dormant by deleting its trigger. The same test also showed
that large always-read instruction surfaces waste tokens without improving the
gate.

Decision:

1. An exemption suppresses a finding only when it names an append-only ADR
   containing an exact authorization for the rule, repository path, and expiry.
   Approver text remains audit data; it is not treated as authentication.
2. Every ratchet finding needs an exact authorization in a newly added ADR.
   The presence of an unrelated ADR authorizes nothing.
3. Registered exemplar implementations and declared external-checker evidence
   are protected contract inputs. Their mutation is a ratchet finding.
4. A required-evidence trigger that matched in the baseline is sticky: deleting
   the trigger cannot silently deactivate the rule.
5. Extend `agentlintel explain` with a compact, shape-aware context frontier.
   Add on-demand skills for scoping changes and proving stateful workflows.
6. Measure compact-context bytes against the equivalent full governance
   context and require at least 50 percent reduction in automated tests. This is
   a deterministic token proxy, not proof of 50 percent model-token savings;
   that product claim still requires repeated matched-agent measurements.
7. Authorization records use one-line JSON so the verifier can match them
   without a new metadata concept:
   `Authorizes-Exemption: {"rule":"<id>","file":"<path>","expires":"YYYY-MM-DD"}`
   and
   `Authorizes-Weakening: {"artifact":"<path>","finding":"<exact finding>"}`.

Authorizes-Weakening: {"artifact":".agentlintel/facts.yaml","finding":"fact 'three-skills' changed its asserted claim"}
Authorizes-Weakening: {"artifact":".agentlintel/facts.yaml","finding":"fact 'three-skills' widened accepted glob count"}
Authorizes-Weakening: {"artifact":".agentlintel/exemplars.yaml","finding":"exemplar 'explain-command' implementation changed at 'tools/agentlintel-cli/src/commands/explain.js'"}

Rejected:

- treating a free-text Approver field as proof of human approval;
- allowing one broad decision record to authorize unrelated weakenings;
- loading the full kernel and decision history into every coding-agent prompt;
- claiming token savings from byte counts alone; and
- adding a seventh framework concept or a separate context compiler.

Consequences:

- repository protections such as CODEOWNERS remain necessary to authenticate
  who may approve decision files;
- exemptions and weakenings become reviewable capabilities with exact scope;
- the existing `explain` command becomes the pre-write context selector; and
- future claims must report both deterministic context reduction and actual
  matched-agent token measurements.
